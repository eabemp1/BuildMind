"""
app/agent/khaya.py — Khaya language API wrappers

Extracted from runtime.py (Section 4, ~L1364–1810).
Covers: translate, TTS, ASR, rate limiting, monthly usage caps.

Import from here; do NOT add new Khaya logic to runtime.py.
"""

import time
import json
import random
import sqlite3
import logging
import requests
from datetime import datetime, timezone
from pathlib import Path

# These are re-imported from runtime config; keep runtime.py as single source of truth.
# In a future cleanup pass, move the env reads here and delete from runtime.py.
from app.agent.runtime import (
    KHAYA_API_KEY,
    APP_DB,
    log_event,
)

logger = logging.getLogger(__name__)

def _khaya_headers():
    if not KHAYA_API_KEY:
        return {}
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Ocp-Apim-Subscription-Key": KHAYA_API_KEY,
        "x-api-key": KHAYA_API_KEY,
        "Authorization": f"Bearer {KHAYA_API_KEY}",
    }

def _json_http_post(url, payload, headers=None, timeout=8):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=(headers or {}), method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        if not raw.strip():
            return {}
        try:
            return json.loads(raw)
        except Exception:
            return {"raw": raw}

def _http_post_raw(url, payload, headers=None, timeout=8):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=(headers or {}), method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        ctype = str(resp.headers.get("Content-Type", "")).strip().lower()
        return raw, ctype

def _http_get_bytes(url, timeout=12):
    req = urllib.request.Request(url, headers={"Accept": "audio/*,*/*"}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        ctype = str(resp.headers.get("Content-Type", "")).strip().lower()
        return raw, ctype

def _parse_retry_after_seconds(http_error):
    try:
        header = str((http_error.headers or {}).get("Retry-After", "")).strip()
    except Exception:
        header = ""
    if not header:
        return KHAYA_RATE_LIMIT_DEFAULT_SEC
    try:
        return max(1, int(float(header)))
    except Exception:
        return KHAYA_RATE_LIMIT_DEFAULT_SEC

def _khaya_rate_limited(op_name):
    now_ts = time.time()
    until = float(_KHAYA_RATE_LIMIT_UNTIL.get(op_name, 0.0) or 0.0)
    if until > now_ts:
        return int(max(1, round(until - now_ts)))
    return 0

def _set_khaya_rate_limit(op_name, retry_after_sec):
    wait_sec = max(1, int(retry_after_sec or KHAYA_RATE_LIMIT_DEFAULT_SEC))
    _KHAYA_RATE_LIMIT_UNTIL[op_name] = time.time() + wait_sec
    return wait_sec

def _khaya_month_key():
    return datetime.now(timezone.utc).strftime("%Y-%m")

def _empty_khaya_usage(month_key):
    return {
        "month": month_key,
        "counts": {
            op: {"attempted": 0, "success": 0, "blocked": 0}
            for op in _KHAYA_OPS
        },
        "updated_at": now_iso(),
    }

def _load_khaya_usage():
    month_key = _khaya_month_key()
    try:
        data = _json_load(KHAYA_USAGE_FILE, None)
        if isinstance(data, dict) and data.get("month") == month_key and isinstance(data.get("counts"), dict):
            for op in _KHAYA_OPS:
                row = data["counts"].get(op)
                if not isinstance(row, dict):
                    data["counts"][op] = {"attempted": 0, "success": 0, "blocked": 0}
                else:
                    row.setdefault("attempted", 0)
                    row.setdefault("success", 0)
                    row.setdefault("blocked", 0)
            return data
    except Exception:
        pass
    return _empty_khaya_usage(month_key)

def _save_khaya_usage(data):
    data["updated_at"] = now_iso()
    _json_save(KHAYA_USAGE_FILE, data)

def _khaya_usage_totals(data):
    counts = data.get("counts", {})
    attempted = sum(int((counts.get(op) or {}).get("attempted", 0) or 0) for op in _KHAYA_OPS)
    success = sum(int((counts.get(op) or {}).get("success", 0) or 0) for op in _KHAYA_OPS)
    blocked = sum(int((counts.get(op) or {}).get("blocked", 0) or 0) for op in _KHAYA_OPS)
    return attempted, success, blocked

def _khaya_usage_start(op_name):
    usage = _load_khaya_usage()
    attempted, _, _ = _khaya_usage_totals(usage)
    if attempted >= KHAYA_MONTHLY_SOFT_CAP:
        usage["counts"][op_name]["blocked"] = int(usage["counts"][op_name].get("blocked", 0) or 0) + 1
        _save_khaya_usage(usage)
        return False, {
            "error": (
                f"Khaya monthly guard reached ({attempted}/{KHAYA_MONTHLY_SOFT_CAP}). "
                "Khaya calls paused to avoid hard quota exhaustion."
            ),
            "code": "monthly_cap_guard",
            "attempted": attempted,
            "cap": KHAYA_MONTHLY_SOFT_CAP,
        }
    usage["counts"][op_name]["attempted"] = int(usage["counts"][op_name].get("attempted", 0) or 0) + 1
    _save_khaya_usage(usage)
    return True, None

def _khaya_usage_mark_success(op_name):
    usage = _load_khaya_usage()
    usage["counts"][op_name]["success"] = int(usage["counts"][op_name].get("success", 0) or 0) + 1
    _save_khaya_usage(usage)

def _khaya_usage_mark_blocked(op_name):
    usage = _load_khaya_usage()
    usage["counts"][op_name]["blocked"] = int(usage["counts"][op_name].get("blocked", 0) or 0) + 1
    _save_khaya_usage(usage)

def _extract_text_from_obj(obj):
    if isinstance(obj, str):
        return obj.strip()
    if isinstance(obj, list):
        for item in obj:
            text = _extract_text_from_obj(item)
            if text:
                return text
        return ""
    if isinstance(obj, dict):
        for key in ["translation", "translated_text", "text", "output", "result", "message"]:
            if key in obj:
                text = _extract_text_from_obj(obj.get(key))
                if text:
                    return text
        for val in obj.values():
            text = _extract_text_from_obj(val)
            if text:
                return text
    return ""

def _is_base64_like_audio(value):
    raw = str(value or "").strip()
    if not raw:
        return False
    if raw.startswith("data:audio/"):
        return True
    if raw.startswith("http://") or raw.startswith("https://"):
        return False
    if len(raw) < 64:
        return False
    return bool(re.fullmatch(r"[A-Za-z0-9+/=\s]+", raw))

def _normalize_audio_b64(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    if raw.startswith("data:audio/"):
        parts = raw.split(",", 1)
        return parts[1].strip() if len(parts) == 2 else ""
    return raw

def _parse_decimal_byte_stream(raw_text):
    raw = str(raw_text or "").strip()
    if not raw:
        return b""
    # Some APIs return raw audio as space-separated decimal bytes.
    if not re.fullmatch(r"(?:\d{1,3}\s+)+\d{1,3}", raw):
        return b""
    vals = []
    for tok in raw.split():
        try:
            n = int(tok)
        except Exception:
            return b""
        if n < 0 or n > 255:
            return b""
        vals.append(n)
    if len(vals) < 16:
        return b""
    return bytes(vals)

def _extract_audio_from_obj(obj):
    if isinstance(obj, str):
        raw = obj.strip()
        if raw.startswith("http://") or raw.startswith("https://"):
            return {"audio_url": raw}
        if _is_base64_like_audio(raw):
            return {"audio_base64": _normalize_audio_b64(raw)}
        return {}
    if isinstance(obj, list):
        for item in obj:
            found = _extract_audio_from_obj(item)
            if found:
                return found
        return {}
    if isinstance(obj, dict):
        audio_keys = [
            "audio_base64", "audio", "speech", "result", "audioContent",
            "audio_url", "audioUrl", "url", "file", "output",
        ]
        for key in audio_keys:
            if key not in obj:
                continue
            found = _extract_audio_from_obj(obj.get(key))
            if found:
                return found
        for val in obj.values():
            found = _extract_audio_from_obj(val)
            if found:
                return found
    return {}

def khaya_translate(text, source_lang, target_lang):
    if not KHAYA_API_KEY:
        return {"error": "Khaya API key not configured"}
    allowed, guard = _khaya_usage_start("translate")
    if not allowed:
        return guard
    wait_left = _khaya_rate_limited("translate")
    if wait_left > 0:
        _khaya_usage_mark_blocked("translate")
        return {
            "error": f"Khaya translation rate-limited. Retry in {wait_left}s.",
            "code": "rate_limited",
            "retry_after_sec": wait_left,
        }
    base = KHAYA_BASE_URL
    path_candidates = []
    for p in [KHAYA_TRANSLATE_PATH, "/v1/translate", "/translate"]:
        p = str(p or "").strip()
        if not p:
            continue
        if not p.startswith("/"):
            p = "/" + p
        if p not in path_candidates:
            path_candidates.append(p)
    src_raw = str(source_lang or "").strip().lower() or "auto"
    tgt_raw = str(target_lang or "").strip().lower() or "en"
    source_candidates = [src_raw]
    if src_raw in {"auto", "detect", "detected"}:
        # Khaya commonly expects explicit pairs like en-tw rather than auto-tw.
        source_candidates = ["en", "tw", "ga", "ee", "yo", "fr"]
    # Preserve order, remove duplicates, and avoid same src/target.
    source_candidates = [s for s in dict.fromkeys(source_candidates) if s and s != tgt_raw]
    if not source_candidates:
        source_candidates = ["en"]

    last_error = ""
    for path in path_candidates:
        url = f"{base}{path}"
        for src in source_candidates:
            payloads = [
                {"text": text, "source_language": src, "target_language": tgt_raw},
                {"text": text, "source": src, "target": tgt_raw},
                {"in": text, "lang": f"{src}-{tgt_raw}"},
                {"sentence": text, "src": src, "tgt": tgt_raw},
            ]
            for payload in payloads:
                try:
                    data = _json_http_post(url, payload, headers=_khaya_headers(), timeout=4)
                    translated = _extract_text_from_obj(data)
                    if translated:
                        _khaya_usage_mark_success("translate")
                        return {"translated_text": translated, "raw": data, "provider": "khaya", "url": url}
                except HTTPError as e:
                    if int(getattr(e, "code", 0) or 0) == 429:
                        _khaya_usage_mark_blocked("translate")
                        retry_after = _set_khaya_rate_limit("translate", _parse_retry_after_seconds(e))
                        return {
                            "error": f"Khaya translation rate-limited. Retry in {retry_after}s.",
                            "code": "rate_limited",
                            "retry_after_sec": retry_after,
                        }
                    detail = ""
                    try:
                        detail = e.read().decode("utf-8", errors="replace")
                    except Exception:
                        detail = str(e)
                    last_error = f"HTTP {e.code}: {detail[:300]}"
                except URLError as e:
                    last_error = f"Network error: {e.reason}"
                except Exception as e:
                    last_error = str(e)
    return {"error": f"Khaya translation failed. {last_error}".strip()}

def khaya_tts(text, language, voice=None):
    if not KHAYA_API_KEY:
        return {"error": "Khaya API key not configured"}
    allowed, guard = _khaya_usage_start("tts")
    if not allowed:
        return guard
    wait_left = _khaya_rate_limited("tts")
    if wait_left > 0:
        _khaya_usage_mark_blocked("tts")
        return {
            "error": f"Khaya TTS rate-limited. Retry in {wait_left}s.",
            "code": "rate_limited",
            "retry_after_sec": wait_left,
        }
    path_candidates = []
    for p in [KHAYA_TTS_PATH, "/v1/tts", "/tts"]:
        p = str(p or "").strip()
        if not p:
            continue
        if not p.startswith("/"):
            p = "/" + p
        if p not in path_candidates:
            path_candidates.append(p)
    last_error = ""
    timeout_sec = max(3, int(os.getenv("KHAYA_TTS_TIMEOUT_SEC", "5")))
    max_attempts = max(1, int(os.getenv("KHAYA_TTS_MAX_ATTEMPTS", "4")))
    attempts = 0
    for path in path_candidates:
        url = f"{KHAYA_BASE_URL}{path}"
        payloads = [
            {"text": str(text or ""), "language": str(language or "en")},
            {"text": str(text or ""), "lang": str(language or "en")},
            {"in": str(text or ""), "lang": str(language or "en")},
            {"input": str(text or ""), "lang": str(language or "en")},
        ]
        if voice:
            payloads = [{**p, "voice": str(voice), "speaker": str(voice)} for p in payloads]
        for payload in payloads:
            attempts += 1
            if attempts > max_attempts:
                break
            try:
                raw_bytes, content_type = _http_post_raw(url, payload, headers=_khaya_headers(), timeout=timeout_sec)
                # Some TTS endpoints return raw audio bytes directly.
                if raw_bytes and (("audio/" in content_type) or ("octet-stream" in content_type)):
                    _khaya_usage_mark_success("tts")
                    return {
                        "audio_base64": base64.b64encode(raw_bytes).decode("ascii"),
                        "provider": "khaya",
                        "raw_content_type": content_type,
                    }

                raw_text = raw_bytes.decode("utf-8", errors="replace").strip() if raw_bytes else ""
                parsed = {}
                if raw_text:
                    byte_stream = _parse_decimal_byte_stream(raw_text)
                    if byte_stream:
                        _khaya_usage_mark_success("tts")
                        return {
                            "audio_base64": base64.b64encode(byte_stream).decode("ascii"),
                            "provider": "khaya",
                            "raw_content_type": (content_type or "text/plain"),
                        }
                    try:
                        parsed = json.loads(raw_text)
                    except Exception:
                        parsed = {"raw": raw_text}
                found = _extract_audio_from_obj(parsed)
                audio_b64 = str(found.get("audio_base64", "")).strip()
                if audio_b64:
                    _khaya_usage_mark_success("tts")
                    return {"audio_base64": _normalize_audio_b64(audio_b64), "provider": "khaya", "raw": parsed}
                audio_url = str(found.get("audio_url", "")).strip()
                if audio_url:
                    data_bytes, data_type = _http_get_bytes(audio_url, timeout=15)
                    if data_bytes:
                        _khaya_usage_mark_success("tts")
                        return {
                            "audio_base64": base64.b64encode(data_bytes).decode("ascii"),
                            "provider": "khaya",
                            "raw": parsed,
                            "fetched_from": audio_url,
                            "raw_content_type": data_type,
                        }
                last_error = "No audio payload found in Khaya TTS response"
            except HTTPError as e:
                if int(getattr(e, "code", 0) or 0) == 429:
                    _khaya_usage_mark_blocked("tts")
                    retry_after = _set_khaya_rate_limit("tts", _parse_retry_after_seconds(e))
                    return {
                        "error": f"Khaya TTS rate-limited. Retry in {retry_after}s.",
                        "code": "rate_limited",
                        "retry_after_sec": retry_after,
                    }
                detail = ""
                try:
                    detail = e.read().decode("utf-8", errors="replace")
                except Exception:
                    detail = str(e)
                last_error = f"HTTP {e.code}: {detail[:300]}"
            except Exception as e:
                last_error = str(e)
        if attempts > max_attempts:
            break
    return {"error": f"Khaya TTS failed: {last_error}"}

def khaya_asr(audio_base64, language=None):
    if not KHAYA_API_KEY:
        return {"error": "Khaya API key not configured"}
    allowed, guard = _khaya_usage_start("asr")
    if not allowed:
        return guard
    path_candidates = []
    for p in [KHAYA_ASR_PATH, "/v1/asr", "/asr"]:
        p = str(p or "").strip()
        if not p:
            continue
        if not p.startswith("/"):
            p = "/" + p
        if p not in path_candidates:
            path_candidates.append(p)
    payload = {"audio_base64": str(audio_base64 or "").strip()}
    if language:
        payload["language"] = str(language)
    last_error = ""
    for path in path_candidates:
        url = f"{KHAYA_BASE_URL}{path}"
        try:
            data = _json_http_post(url, payload, headers=_khaya_headers(), timeout=40)
            text = _extract_text_from_obj(data)
            if text:
                _khaya_usage_mark_success("asr")
                return {"text": text, "provider": "khaya", "raw": data}
            last_error = "No transcript in ASR response"
        except HTTPError as e:
            if int(getattr(e, "code", 0) or 0) == 429:
                _khaya_usage_mark_blocked("asr")
                retry_after = _set_khaya_rate_limit("asr", _parse_retry_after_seconds(e))
                return {
                    "error": f"Khaya ASR rate-limited. Retry in {retry_after}s.",
                    "code": "rate_limited",
                    "retry_after_sec": retry_after,
                }
            last_error = f"HTTP {e.code}"
        except Exception as e:
            last_error = str(e)
    return {"error": f"Khaya ASR failed: {last_error}"}

