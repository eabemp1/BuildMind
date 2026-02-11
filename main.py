# main.py - Lumiere (thumbs rating, levels, fact extraction, chat history, full model selector - Gemini FIXED)

from groq import Groq
import os
import json
import re
import random
import hashlib
import urllib.parse
import urllib.request
from urllib.error import URLError, HTTPError
from datetime import datetime, timedelta
from uuid import uuid4
from html import escape as html_escape, unescape as html_unescape
from dotenv import load_dotenv
from fastapi import FastAPI, Form, Body, UploadFile, File
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from pathlib import Path
from typing import Optional

load_dotenv()

app = FastAPI(title="Lumiere")

app.mount("/static", StaticFiles(directory="static"), name="static")

BASE_DIR = Path(__file__).resolve().parent
USER_PROFILE_FILE = BASE_DIR / "user_profile.json"
AGENT_FILE = BASE_DIR / "agents.json"
REMINDER_FILE = BASE_DIR / "reminders.json"
BLOCKCHAIN_FILE = BASE_DIR / "blockchain_state.json"
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

def load_user_profile():
    if USER_PROFILE_FILE.exists():
        with USER_PROFILE_FILE.open('r', encoding="utf-8") as f:
            return json.load(f)
    return {"name": None, "theme": "system", "accent": "#3b82f6", "model": "groq-llama3.3"}

def save_user_profile(profile):
    with USER_PROFILE_FILE.open('w', encoding="utf-8") as f:
        json.dump(profile, f, indent=2)

profile = load_user_profile()
user_name = profile.get("name")
theme = profile.get("theme", "system")
accent_color = profile.get("accent", "#3b82f6")
current_model = profile.get("model", "groq-llama3.3")

MODELS = {
    "groq-llama3.3": {
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "api_key": os.getenv("GROQ_API_KEY"),
        "label": "Groq Llama 3.3 70B"
    },
    "groq-llama3.1-70b": {
        "provider": "groq",
        "model": "llama-3.1-70b-versatile",
        "api_key": os.getenv("GROQ_API_KEY"),
        "label": "Groq Llama 3.1 70B"
    },
    "groq-llama3.1-8b": {
        "provider": "groq",
        "model": "llama-3.1-8b-instant",
        "api_key": os.getenv("GROQ_API_KEY"),
        "label": "Groq Llama 3.1 8B Instant"
    },
    "groq-mixtral-8x7b": {
        "provider": "groq",
        "model": "mixtral-8x7b-32768",
        "api_key": os.getenv("GROQ_API_KEY"),
        "label": "Groq Mixtral 8x7B"
    },
    "groq-gemma2-9b": {
        "provider": "groq",
        "model": "gemma2-9b-it",
        "api_key": os.getenv("GROQ_API_KEY"),
        "label": "Groq Gemma 2 9B"
    },
    "gemini-1.5-flash": {
        "provider": "google",
        "model": "gemini-2.0-flash",
        "api_key": os.getenv("GEMINI_API_KEY"),
        "label": "Gemini 2.0 Flash"
    },
    "claude-3.5-sonnet": {
        "provider": "anthropic",
        "model": "claude-3-5-sonnet-20241022",
        "api_key": os.getenv("CLAUDE_API_KEY"),
        "label": "Claude 3.5 Sonnet"
    }
}

def _google_model_candidates(requested_model):
    requested_model = (requested_model or "").strip()
    names = []
    if requested_model:
        names.append(requested_model)
        if requested_model.startswith("models/"):
            names.append(requested_model.split("models/", 1)[1])
        else:
            names.append(f"models/{requested_model}")

    # Known practical fallbacks when older aliases are retired.
    names.extend([
        "gemini-2.0-flash",
        "models/gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "models/gemini-2.0-flash-lite",
        "gemini-1.5-flash-latest",
        "models/gemini-1.5-flash-latest",
    ])

    deduped = []
    for name in names:
        if name and name not in deduped:
            deduped.append(name)
    return deduped

def _supports_generate_content(model_obj):
    methods = getattr(model_obj, "supported_generation_methods", None)
    if methods and isinstance(methods, (list, tuple)):
        methods_lower = [str(m).lower() for m in methods]
        return any("generatecontent" in m for m in methods_lower)
    return True

def _is_google_quota_error(err_text):
    text = (err_text or "").lower()
    return "resource_exhausted" in text or "quota exceeded" in text

def _extract_retry_seconds(err_text):
    match = re.search(r"Please retry in ([0-9.]+)s", err_text or "")
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None

def _fallback_after_google_quota(question):
    groq_cfg = MODELS.get("groq-llama3.3", {})
    if groq_cfg.get("api_key"):
        try:
            client = Groq(api_key=groq_cfg["api_key"])
            system_prompt = f"You are Lumiere, personal companion of {user_name or 'friend'}. Warm, casual tone. Start with 'Yh, {user_name or 'friend'}'. Helpful, encouraging. No Markdown."
            completion = client.chat.completions.create(
                model=groq_cfg["model"],
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": question}
                ],
                temperature=0.75,
                max_tokens=600,
            )
            return ("Groq Llama 3.3", completion.choices[0].message.content.strip())
        except Exception:
            pass

    claude_cfg = MODELS.get("claude-3.5-sonnet", {})
    if claude_cfg.get("api_key"):
        try:
            from anthropic import Anthropic
            client = Anthropic(api_key=claude_cfg["api_key"])
            message = client.messages.create(
                model=claude_cfg["model"],
                max_tokens=600,
                temperature=0.75,
                system=f"You are Lumiere, personal companion of {user_name or 'friend'}. Warm, casual tone. Start with 'Yh, {user_name or 'friend'}'. Helpful, encouraging. No Markdown.",
                messages=[{"role": "user", "content": question}]
            )
            return ("Claude 3.5 Sonnet", message.content[0].text.strip())
        except Exception:
            pass

    return (None, None)

def ask_llm(question):
    config = MODELS.get(current_model, MODELS["groq-llama3.3"])
    if not config.get("api_key"):
        return f"Error: API key missing for {current_model}"

    provider = config["provider"]
    model_name = config["model"]

    if provider == "groq":
        client = Groq(api_key=config["api_key"])
        try:
            system_prompt = f"You are Lumiere, personal companion of {user_name or 'friend'}. Warm, casual tone. Start with 'Yh, {user_name or 'friend'}'. Helpful, encouraging. No Markdown."
            completion = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": question}
                ],
                temperature=0.75,
                max_tokens=600,
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            return f"Groq error: {str(e)}"

    elif provider == "google":
        try:
            from google import genai
            client = genai.Client(api_key=config["api_key"])

            # Try requested + common aliases first.
            for candidate in _google_model_candidates(model_name):
                try:
                    response = client.models.generate_content(
                        model=candidate,
                        contents=question
                    )
                    text = getattr(response, "text", None)
                    if text:
                        return text.strip()
                except Exception as candidate_err:
                    if "NOT_FOUND" not in str(candidate_err):
                        raise

            # Final fallback: discover available models and choose one that supports generateContent.
            try:
                listed_models = list(client.models.list())
                listed_models = [m for m in listed_models if _supports_generate_content(m)]
                listed_models.sort(key=lambda m: ("flash" not in str(getattr(m, "name", "")).lower(), str(getattr(m, "name", ""))))
                if listed_models:
                    fallback_name = getattr(listed_models[0], "name", None)
                    if fallback_name:
                        response = client.models.generate_content(
                            model=fallback_name,
                            contents=question
                        )
                        text = getattr(response, "text", None)
                        if text:
                            print(f"[SERVER] Gemini fallback model used: {fallback_name}")
                            return text.strip()
            except Exception:
                pass

            return "Gemini error: No available generateContent model was found for this API key/project."
        except ImportError:
            try:
                import google.generativeai as genai
                genai.configure(api_key=config["api_key"])

                for candidate in _google_model_candidates(model_name):
                    try:
                        response = genai.GenerativeModel(candidate).generate_content(question)
                        text = getattr(response, "text", None)
                        if text:
                            return text.strip()
                    except Exception as candidate_err:
                        if "NOT_FOUND" not in str(candidate_err):
                            raise

                try:
                    listed_models = [
                        m for m in genai.list_models()
                        if "generateContent" in getattr(m, "supported_generation_methods", [])
                    ]
                    listed_models.sort(key=lambda m: ("flash" not in str(getattr(m, "name", "")).lower(), str(getattr(m, "name", ""))))
                    if listed_models:
                        fallback_name = getattr(listed_models[0], "name", None)
                        if fallback_name:
                            response = genai.GenerativeModel(fallback_name).generate_content(question)
                            text = getattr(response, "text", None)
                            if text:
                                print(f"[SERVER] Gemini fallback model used: {fallback_name}")
                                return text.strip()
                except Exception:
                    pass

                return "Gemini error: No available generateContent model was found for this API key/project."
            except Exception as e:
                err_text = str(e)
                if _is_google_quota_error(err_text):
                    retry_secs = _extract_retry_seconds(err_text)
                    provider_name, fallback_answer = _fallback_after_google_quota(question)
                    retry_text = f" Retry in about {int(round(retry_secs))}s." if retry_secs is not None else ""
                    if provider_name and fallback_answer:
                        return f"Gemini quota exhausted.{retry_text} Switched to {provider_name}.\n\n{fallback_answer}"
                    return f"Gemini quota exhausted.{retry_text} No fallback provider key is configured."
                return f"Gemini error: {str(e)}"
        except Exception as e:
            err_text = str(e)
            if _is_google_quota_error(err_text):
                retry_secs = _extract_retry_seconds(err_text)
                provider_name, fallback_answer = _fallback_after_google_quota(question)
                retry_text = f" Retry in about {int(round(retry_secs))}s." if retry_secs is not None else ""
                if provider_name and fallback_answer:
                    return f"Gemini quota exhausted.{retry_text} Switched to {provider_name}.\n\n{fallback_answer}"
                return f"Gemini quota exhausted.{retry_text} No fallback provider key is configured."
            return f"Gemini error: {str(e)}"

    elif provider == "anthropic":
        try:
            from anthropic import Anthropic
            client = Anthropic(api_key=config["api_key"])
            message = client.messages.create(
                model=model_name,
                max_tokens=600,
                temperature=0.75,
                system=f"You are Lumiere, personal companion of {user_name or 'friend'}. Warm, casual tone. Start with 'Yh, {user_name or 'friend'}'. Helpful, encouraging. No Markdown.",
                messages=[{"role": "user", "content": question}]
            )
            return message.content[0].text.strip()
        except Exception as e:
            return f"Claude error: {str(e)}"

    return f"Model '{current_model}' not supported"

def _http_get_text(url, timeout=10):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LumiereBot/1.0",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")

def _clean_html_fragment(raw):
    cleaned = re.sub(r"<[^>]+>", "", raw or "")
    return html_unescape(" ".join(cleaned.split())).strip()

def _extract_page_text(html, max_chars=5000):
    text = re.sub(r"(?is)<script.*?>.*?</script>", " ", html or "")
    text = re.sub(r"(?is)<style.*?>.*?</style>", " ", text)
    text = re.sub(r"(?is)<noscript.*?>.*?</noscript>", " ", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html_unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]

def _unwrap_duckduckgo_link(url):
    parsed = urllib.parse.urlparse(url)
    if "duckduckgo.com" in parsed.netloc and parsed.path.startswith("/l/"):
        qs = urllib.parse.parse_qs(parsed.query)
        uddg = qs.get("uddg", [None])[0]
        if uddg:
            return urllib.parse.unquote(uddg)
    return url

def _duckduckgo_search(query, max_results=5):
    encoded_q = urllib.parse.quote_plus(query)
    search_url = f"https://duckduckgo.com/html/?q={encoded_q}"
    try:
        html = _http_get_text(search_url, timeout=10)
    except Exception as e:
        print(f"[SERVER] Live search failed at request: {e}")
        return []

    links = re.findall(
        r'(?is)<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
        html,
    )
    snippets = re.findall(r'(?is)<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>', html)
    if not snippets:
        snippets = re.findall(r'(?is)<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</div>', html)

    out = []
    seen = set()
    for idx, (href, title_html) in enumerate(links):
        url = _unwrap_duckduckgo_link(html_unescape(href))
        if not url.startswith("http"):
            continue
        if url in seen:
            continue
        seen.add(url)
        title = _clean_html_fragment(title_html)
        snippet = _clean_html_fragment(snippets[idx] if idx < len(snippets) else "")
        if not title:
            continue
        out.append({"title": title, "url": url, "snippet": snippet})
        if len(out) >= max_results:
            break
    return out

def live_web_answer(question, max_sources=3, extra_context=""):
    results = _duckduckgo_search(question, max_results=6)
    if not results:
        return None, []

    sources = []
    for item in results:
        try:
            page_html = _http_get_text(item["url"], timeout=8)
            page_text = _extract_page_text(page_html, max_chars=3200)
            if len(page_text) < 240:
                continue
            sources.append({
                "title": item["title"],
                "url": item["url"],
                "snippet": item["snippet"],
                "content": page_text,
            })
            if len(sources) >= max_sources:
                break
        except (HTTPError, URLError, TimeoutError, ValueError):
            continue
        except Exception:
            continue

    if not sources:
        return None, []

    source_blocks = []
    for i, s in enumerate(sources, start=1):
        source_blocks.append(
            f"[Source {i}] {s['title']}\nURL: {s['url']}\nSnippet: {s['snippet']}\nContent: {s['content']}"
        )
    prompt = f"""
You are Lumiere. Use the web sources below to answer the user.
Rules:
- Prefer source-grounded statements.
- If sources conflict, mention that.
- End with a short "Sources used: [1], [2]..." line.
- Keep it concise and practical.

User question: {question}
{f"Extra context:\\n{extra_context}" if extra_context else ""}

{chr(10).join(source_blocks)}
"""
    answer_plain = ask_llm(prompt)
    return answer_plain, sources

def _split_md_row(line):
    row = (line or "").strip()
    if row.startswith("|"):
        row = row[1:]
    if row.endswith("|"):
        row = row[:-1]
    return [cell.strip() for cell in row.split("|")]

def _is_md_separator(line):
    if not line or "|" not in line:
        return False
    row = line.strip()
    if row.startswith("|"):
        row = row[1:]
    if row.endswith("|"):
        row = row[:-1]
    parts = [p.strip() for p in row.split("|")]
    if not parts:
        return False
    return all(re.match(r"^:?-{3,}:?$", p) for p in parts if p)

def format_ai_text_html(text):
    lines = str(text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    html_parts = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if (
            i + 1 < len(lines)
            and "|" in line
            and _is_md_separator(lines[i + 1])
        ):
            header = _split_md_row(line)
            i += 2
            rows = []
            while i < len(lines) and "|" in lines[i] and lines[i].strip():
                rows.append(_split_md_row(lines[i]))
                i += 1

            thead = "".join(f"<th>{html_escape(col)}</th>" for col in header)
            tbody_rows = []
            for row in rows:
                cells = "".join(f"<td>{html_escape(cell)}</td>" for cell in row)
                tbody_rows.append(f"<tr>{cells}</tr>")
            table_html = f"""
<div class="table-wrap">
    <table class="ai-table">
        <thead><tr>{thead}</tr></thead>
        <tbody>{''.join(tbody_rows)}</tbody>
    </table>
</div>
"""
            html_parts.append(table_html)
            continue

        escaped = html_escape(line)
        if escaped:
            html_parts.append(escaped)
        else:
            html_parts.append("<br>")
        i += 1

    rendered = "<br>".join(part for part in html_parts if part is not None)
    rendered = re.sub(r"(<br>){3,}", "<br><br>", rendered)
    return rendered

def summarize_upload_for_context(file_name, content_type, file_bytes):
    size_kb = max(1, len(file_bytes) // 1024)
    ctype = (content_type or "").lower()
    base = f"File: {file_name} ({content_type or 'unknown'}, ~{size_kb}KB). "

    if ctype.startswith("text/") or file_name.lower().endswith((".txt", ".md", ".csv", ".json")):
        try:
            decoded = file_bytes.decode("utf-8", errors="replace")
            snippet = re.sub(r"\s+", " ", decoded).strip()[:1800]
            return base + "Text excerpt: " + snippet
        except Exception:
            return base + "Text file uploaded."

    if ctype == "application/pdf" or file_name.lower().endswith(".pdf"):
        return base + "PDF uploaded. OCR/PDF parsing is limited in this MVP; use targeted questions about this file."

    if ctype.startswith("image/"):
        return base + "Image uploaded. OCR/vision parsing is limited in this MVP; describe what to analyze."

    return base + "Uploaded as extra context."

def upload_context_block():
    if not uploaded_context:
        return ""
    rows = []
    for item in uploaded_context[-5:]:
        rows.append(f"- {item.get('name', 'file')}: {item.get('summary', '')}")
    return "Uploaded context:\n" + "\n".join(rows) + "\n"

def level_tone(level):
    if level >= 5:
        return "Tone: witty, proactive, confident. Offer sharp suggestions and anticipate one useful follow-up."
    if level >= 3:
        return "Tone: confident, playful, and clear. Keep answers practical."
    return "Tone: helpful, simple, and clear. Avoid overconfidence."

def maybe_memory_callback(agent, user_name_hint=None):
    actor_key = normalize_actor_key(user_name_hint)
    facts = agent.get_facts(actor_key) if agent else []
    if not agent or not facts:
        return ""
    if random.random() > 0.20:
        return ""

    fact = random.choice(facts).strip()
    if not fact:
        return ""

    name = (user_name_hint or "friend").strip()
    openers = [
        f"Yh, {name}, quick memory check:",
        f"Yh, {name}, I remember this:",
        f"Yh, {name}, still relevant from before:",
    ]
    return f"{random.choice(openers)} {fact}"

def _parse_time_token(time_token):
    token = (time_token or "").strip().lower().replace(".", "")
    token = token.replace(" ", "")
    m = re.match(r"^(\d{1,2})(?::(\d{2}))?(am|pm)?$", token)
    if not m:
        return None
    hour = int(m.group(1))
    minute = int(m.group(2) or 0)
    suffix = m.group(3)
    if suffix:
        if hour == 12:
            hour = 0
        if suffix == "pm":
            hour += 12
    if hour > 23 or minute > 59:
        return None
    return hour, minute

def parse_due_datetime_from_text(text, now=None):
    now = now or datetime.now()
    t = (text or "").lower()

    # in N hours/minutes
    m = re.search(r"\bin\s+(\d{1,3})\s*(minute|minutes|min|hour|hours|hr|hrs)\b", t)
    if m:
        qty = int(m.group(1))
        unit = m.group(2)
        due = now + (timedelta(minutes=qty) if unit.startswith("m") else timedelta(hours=qty))
        return due

    day_base = now.date()
    if "tomorrow" in t:
        day_base = (now + timedelta(days=1)).date()
    elif "today" in t:
        day_base = now.date()
    else:
        abs_date = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", t)
        if abs_date:
            try:
                day_base = datetime(
                    int(abs_date.group(1)),
                    int(abs_date.group(2)),
                    int(abs_date.group(3)),
                ).date()
            except ValueError:
                day_base = now.date()

    tm = re.search(r"\bat\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm)?)\b", t)
    if not tm:
        tm = re.search(r"\b([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm))\b", t)
    if tm:
        parsed = _parse_time_token(tm.group(1))
        if parsed:
            hour, minute = parsed
            return datetime.combine(day_base, datetime.min.time()).replace(hour=hour, minute=minute)

    # no explicit time but has relative day -> default 9:00
    if "tomorrow" in t or "today" in t or re.search(r"\b\d{4}-\d{2}-\d{2}\b", t):
        return datetime.combine(day_base, datetime.min.time()).replace(hour=9, minute=0)

    return None

def parse_reminder_command(text):
    raw = (text or "").strip()
    lowered = raw.lower()

    patterns = [
        r"^\s*remind me to\s+(.+)$",
        r"^\s*set (?:a )?reminder(?: to)?\s+(.+)$",
        r"^\s*add (?:a )?(?:task|reminder)\s+(.+)$",
    ]
    payload = None
    for pat in patterns:
        m = re.match(pat, raw, flags=re.IGNORECASE)
        if m:
            payload = m.group(1).strip()
            break
    if not payload:
        return None

    due_dt = parse_due_datetime_from_text(payload)
    cleaned = re.sub(r"\b(tomorrow|today)\b", "", payload, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bin\s+\d{1,3}\s*(minute|minutes|min|hour|hours|hr|hrs)\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bat\s+[0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm)?\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b\d{4}-\d{2}-\d{2}\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.-")
    if not cleaned:
        cleaned = payload

    return {
        "task_text": cleaned,
        "due_at": due_dt.isoformat() if due_dt else None,
        "source_text": payload,
    }

def due_reminder_nudges(now=None, max_items=2):
    now = now or datetime.now()
    due_items = []
    for item in reminders:
        if item.get("done"):
            continue
        due_at_raw = item.get("due_at")
        if not due_at_raw:
            continue
        try:
            due_at = datetime.fromisoformat(due_at_raw)
        except Exception:
            continue
        if due_at > now:
            continue

        last_nudge_raw = item.get("last_nudged_at")
        recently_nudged = False
        if last_nudge_raw:
            try:
                recently_nudged = (now - datetime.fromisoformat(last_nudge_raw)) < timedelta(minutes=20)
            except Exception:
                recently_nudged = False
        if recently_nudged:
            continue

        delta = now - due_at
        status = "due now" if delta < timedelta(minutes=2) else f"overdue by {int(delta.total_seconds() // 60)} min"
        due_items.append((item, status))

    if not due_items:
        return []

    nudges = []
    for item, status in due_items[:max_items]:
        item["last_nudged_at"] = now.isoformat()
        nudges.append(f"Reminder check: '{item.get('text', 'task')}' is {status}.")
    save_reminders()
    return nudges

def extract_facts_with_llm(question, answer, existing_facts):
    groq_cfg = MODELS.get("groq-llama3.1-8b", MODELS.get("groq-llama3.3", {}))
    if not groq_cfg.get("api_key"):
        return []

    facts_seed = "\n".join(f"- {f}" for f in (existing_facts or [])[-8:])
    extraction_prompt = f"""
You extract durable user facts from conversations.
Return ONLY strict JSON with this schema:
{{"facts": ["fact 1", "fact 2"]}}

Rules:
- Extract only stable, user-specific facts or preferences.
- Keep each fact under 18 words.
- Skip generic assistant output.
- If nothing useful, return {{"facts": []}}.
- Do not include duplicates of existing facts.

Existing facts:
{facts_seed}

Conversation:
User: {question}
Assistant: {answer}
"""
    try:
        client = Groq(api_key=groq_cfg["api_key"])
        completion = client.chat.completions.create(
            model=groq_cfg["model"],
            messages=[
                {"role": "system", "content": "You are a strict JSON extractor. Output only valid JSON."},
                {"role": "user", "content": extraction_prompt},
            ],
            temperature=0.1,
            max_tokens=220,
        )
        raw = completion.choices[0].message.content.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        parsed = json.loads(raw)
        facts = parsed.get("facts", [])
        cleaned = []
        existing_lower = {f.lower() for f in (existing_facts or [])}
        for fact in facts:
            if not isinstance(fact, str):
                continue
            fact_clean = " ".join(fact.split()).strip()
            if not fact_clean:
                continue
            if fact_clean.lower() in existing_lower:
                continue
            cleaned.append(fact_clean)
        return cleaned[:3]
    except Exception as e:
        print(f"[SERVER] Fact extraction fallback: {e}")
        return []

def normalize_actor_key(user_id):
    key = str(user_id or "").strip().lower()
    return key or "shared"

class Agent:
    def __init__(self, name, specialty, accuracy=50.0):
        self.name = name
        self.specialty = specialty
        self.accuracy = accuracy
        self.level = 1
        self.positive_ratings = 0
        self.user_profiles = {}  # actor_key -> {"raw_history": [], "facts": []}

    def _ensure_profile(self, user_id):
        key = normalize_actor_key(user_id)
        if key not in self.user_profiles or not isinstance(self.user_profiles.get(key), dict):
            self.user_profiles[key] = {"raw_history": [], "facts": []}
        profile = self.user_profiles[key]
        profile.setdefault("raw_history", [])
        profile.setdefault("facts", [])
        return key, profile

    def add_interaction(self, question, answer, user_id=None):
        _, profile = self._ensure_profile(user_id)
        profile["raw_history"].append({"role": "user", "content": question})
        profile["raw_history"].append({"role": "ai", "content": answer[:500]})
        if len(profile["raw_history"]) > 20:
            profile["raw_history"] = profile["raw_history"][-20:]

        extracted_facts = extract_facts_with_llm(question, answer, profile["facts"])
        profile["facts"].extend(extracted_facts)
        if len(profile["facts"]) > 10:
            profile["facts"] = profile["facts"][-10:]

    def get_recent_messages(self, limit=10, user_id=None):
        _, profile = self._ensure_profile(user_id)
        clipped = profile["raw_history"][-limit:]
        normalized = []
        for item in clipped:
            if isinstance(item, dict):
                role = item.get("role", "ai")
                content = str(item.get("content", "")).strip()
                if content:
                    normalized.append({"role": role, "content": content})
            elif isinstance(item, str):
                if item.startswith("User:"):
                    normalized.append({"role": "user", "content": item.replace("User:", "", 1).strip()})
                elif item.startswith("You:"):
                    normalized.append({"role": "ai", "content": item.replace("You:", "", 1).strip()})
                else:
                    normalized.append({"role": "ai", "content": item.strip()})
        return normalized[-limit:]

    def get_facts(self, user_id=None):
        _, profile = self._ensure_profile(user_id)
        return profile["facts"][-10:]

    def get_memory_summary(self, user_id=None):
        parts = []
        facts = self.get_facts(user_id)
        if facts:
            parts.append("Key facts:\n" + "\n".join(facts))
        recent = self.get_recent_messages(limit=8, user_id=user_id)
        if recent:
            compact = []
            for item in recent:
                prefix = "User" if item["role"] == "user" else "You"
                compact.append(f"{prefix}: {item['content']}")
            parts.append("Recent:\n" + "\n".join(compact))
        return "\n\n".join(parts) + "\n" if parts else ""

def load_agents():
    if AGENT_FILE.exists():
        with AGENT_FILE.open('r', encoding="utf-8") as f:
            data = json.load(f)
            loaded = []
            for item in data:
                agent = Agent(item["name"], item["specialty"], item["accuracy"])
                agent.level = item.get("level", 1)
                agent.positive_ratings = item.get("positive_ratings", 0)
                profiles = item.get("user_profiles")
                if isinstance(profiles, dict) and profiles:
                    agent.user_profiles = profiles
                else:
                    legacy_history = item.get("raw_history", [])
                    legacy_facts = item.get("facts", [])
                    migrated = []
                    for line in legacy_history:
                        if isinstance(line, dict):
                            migrated.append(line)
                        elif isinstance(line, str):
                            if line.startswith("User:"):
                                migrated.append({"role": "user", "content": line.replace("User:", "", 1).strip()})
                            elif line.startswith("You:"):
                                migrated.append({"role": "ai", "content": line.replace("You:", "", 1).strip()})
                            else:
                                migrated.append({"role": "ai", "content": line.strip()})
                    actor_seed = normalize_actor_key(user_name)
                    agent.user_profiles = {
                        actor_seed: {
                            "raw_history": migrated[-20:],
                            "facts": [str(f).strip() for f in legacy_facts if str(f).strip()][-10:],
                        }
                    }
                loaded.append(agent)
            return loaded
    return None

def save_agents():
    data = [
        {
            "name": agent.name,
            "specialty": agent.specialty,
            "accuracy": agent.accuracy,
            "level": agent.level,
            "positive_ratings": agent.positive_ratings,
            "user_profiles": agent.user_profiles
        }
        for agent in squad
    ]
    with AGENT_FILE.open('w', encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print("[SERVER] Agents saved")

def load_reminders():
    if REMINDER_FILE.exists():
        with REMINDER_FILE.open("r", encoding="utf-8") as f:
            try:
                loaded = json.load(f)
                if isinstance(loaded, list):
                    return loaded
            except Exception:
                pass
    return []

def save_reminders():
    with REMINDER_FILE.open("w", encoding="utf-8") as f:
        json.dump(reminders, f, indent=2)
    print("[SERVER] Reminders saved")

def now_iso():
    return datetime.utcnow().isoformat() + "Z"

def _mock_sol_mint():
    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    return "".join(random.choice(alphabet) for _ in range(44))

def default_chain_state():
    return {
        "network": "solana-devnet-mock",
        "tokens": {},
        "rentals": {},
        "tx_log": [],
        "updated_at": now_iso(),
    }

def load_chain_state():
    if BLOCKCHAIN_FILE.exists():
        try:
            with BLOCKCHAIN_FILE.open("r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                data.setdefault("network", "solana-devnet-mock")
                data.setdefault("tokens", {})
                data.setdefault("rentals", {})
                data.setdefault("tx_log", [])
                return data
        except Exception:
            pass
    return default_chain_state()

def save_chain_state():
    chain_state["updated_at"] = now_iso()
    with BLOCKCHAIN_FILE.open("w", encoding="utf-8") as f:
        json.dump(chain_state, f, indent=2)

def record_chain_event(event_type, specialty, payload):
    prev_hash = chain_state["tx_log"][-1]["hash"] if chain_state.get("tx_log") else "genesis"
    body = {
        "ts": now_iso(),
        "event": event_type,
        "specialty": specialty,
        "payload": payload,
        "prev_hash": prev_hash,
    }
    hash_input = json.dumps(body, sort_keys=True).encode("utf-8")
    body["hash"] = hashlib.sha256(hash_input).hexdigest()
    chain_state["tx_log"].append(body)
    if len(chain_state["tx_log"]) > 500:
        chain_state["tx_log"] = chain_state["tx_log"][-500:]

def ensure_agent_token(agent, owner=None):
    specialty = agent.specialty
    token = chain_state["tokens"].get(specialty)
    if token:
        return token
    owner_name = owner or user_name or "local_user"
    token = {
        "specialty": specialty,
        "agent_name": agent.name,
        "mint_address": _mock_sol_mint(),
        "owner": owner_name,
        "ownership_history": [
            {"owner": owner_name, "at": now_iso(), "reason": "mint"}
        ],
        "listed": False,
        "list_price_sol": None,
        "rent_price_sol_per_hour": 0.05,
        "train_score": 0,
        "usage_count": 0,
        "value_score": round(max(1.0, agent.level + agent.accuracy / 100), 3),
        "metadata_uri": f"mock://lumiere/{specialty}",
        "last_train_at": None,
        "created_at": now_iso(),
    }
    chain_state["tokens"][specialty] = token
    record_chain_event("mint", specialty, {"owner": owner_name, "mint_address": token["mint_address"]})
    save_chain_state()
    return token

def active_rental_for_specialty(specialty):
    rental = chain_state["rentals"].get(specialty)
    if not rental:
        return None
    expires = rental.get("expires_at")
    if not expires:
        return None
    try:
        if datetime.fromisoformat(expires) < datetime.utcnow():
            chain_state["rentals"].pop(specialty, None)
            save_chain_state()
            return None
    except Exception:
        return None
    return rental

def rental_lock_for_requester(specialty, requester_name):
    rental = active_rental_for_specialty(specialty)
    if not rental:
        return None
    renter = str(rental.get("renter", "")).strip()
    requester = str(requester_name or "").strip()
    if renter and requester and renter.lower() == requester.lower():
        return None
    return rental

def effective_requester_name(requester: Optional[str]):
    candidate = (requester or "").strip()
    if candidate:
        return candidate
    base = (user_name or "").strip()
    return base or "local_user"

def train_token_from_signal(specialty, rating_value=0, usage_inc=0):
    token = chain_state["tokens"].get(specialty)
    if not token:
        return None
    token["usage_count"] = int(token.get("usage_count", 0)) + int(max(0, usage_inc))
    if rating_value > 0:
        token["train_score"] = int(token.get("train_score", 0)) + int(rating_value)
    delta = (max(0, rating_value) * 0.08) + (max(0, usage_inc) * 0.01)
    token["value_score"] = round(float(token.get("value_score", 1.0)) + delta, 3)
    token["last_train_at"] = now_iso()
    save_chain_state()
    return token

saved_squad = load_agents()
if saved_squad is not None:
    squad = saved_squad
    print("[SERVER] Loaded agents from disk")
else:
    squad = [
        Agent("Math Expert", "math"),
        Agent("Finance Guide", "finance"),
        Agent("Cooking Buddy", "cooking"),
        Agent("Reminder Manager", "reminders"),
        Agent("General Companion", "general")
    ]
    print("[SERVER] Using default agents")

last_specialty = "general"
reminders = load_reminders()
uploaded_context = []
chain_state = load_chain_state()
for _agent in squad:
    ensure_agent_token(_agent)

SPECIALTY_KEYWORDS = {
    "math": ["math", "equation", "calculate", "solve", "percent", "%", "algebra", "geometry", "number", "sum", "multiply", "divide"],
    "finance": ["finance", "money", "invest", "stock", "budget", "debt", "crypto", "bitcoin", "saving", "bank", "loan"],
    "cooking": ["cook", "recipe", "food", "meal", "bake", "kitchen", "dinner", "lunch", "ingredient", "dish"],
    "reminders": ["remind", "reminder", "task", "schedule", "alert", "todo", "meeting", "appointment", "plan"],
}

def detect_specialty(q_lower):
    for specialty, words in SPECIALTY_KEYWORDS.items():
        if any(word in q_lower for word in words):
            return specialty
    return "general"

def get_or_create_agent(specialty):
    agent = next((a for a in squad if a.specialty == specialty), None)
    if agent:
        return agent
    agent = Agent(f"{specialty.capitalize()} Expert", specialty)
    squad.append(agent)
    print(f"[SERVER] Created new agent: {agent.name}")
    return agent

def choose_debate_agents(question):
    text = question.lower()
    scores = {k: 0 for k in SPECIALTY_KEYWORDS.keys()}
    for specialty, words in SPECIALTY_KEYWORDS.items():
        for word in words:
            if word in text:
                scores[specialty] += 1

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    primary = ranked[0][0] if ranked and ranked[0][1] > 0 else detect_specialty(text)
    secondary = None
    for specialty, score in ranked[1:]:
        if specialty != primary and score > 0:
            secondary = specialty
            break
    if not secondary:
        secondary = "general" if primary != "general" else "finance"
    return get_or_create_agent(primary), get_or_create_agent(secondary)

@app.get("/", response_class=HTMLResponse)
async def home():
    if not user_name:
        return """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to Lumiere</title>
            <style>
                body { margin:0; height:100vh; background: linear-gradient(135deg, #0f172a, #0f766e 55%, #f97316); display:flex; justify-content:center; align-items:center; font-family: 'Segoe UI', sans-serif; color:white; }
                .card { background:rgba(255,255,255,0.15); backdrop-filter:blur(10px); padding:3rem 2.5rem; border-radius:20px; text-align:center; box-shadow:0 8px 32px rgba(0,0,0,0.37); border:1px solid rgba(255,255,255,0.18); max-width:450px; width:90%; }
                h1 { font-size:2.8rem; margin-bottom:1.5rem; }
                p { font-size:1.2rem; margin-bottom:2rem; opacity:0.9; }
                input { width:100%; padding:14px; font-size:1.1rem; border:none; border-radius:10px; margin-bottom:1.5rem; }
                button { padding:14px 40px; font-size:1.1rem; background:#fff; color:#0b3b5b; border:none; border-radius:10px; cursor:pointer; }
                button:hover { background:#f0f0f0; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Welcome to Lumiere</h1>
                <p>I'm your personal, evolving AI companion. What's your name?</p>
                <form action="/set-name" method="post">
                    <input type="text" name="name" placeholder="Your name..." required autocomplete="off">
                    <button type="submit">Let's begin</button>
                </form>
            </div>
        </body>
        </html>
        """

    theme_class = 'theme-dark' if theme == 'dark' else 'theme-light'
    safe_name = user_name or "friend"
    accent_rgb = "34, 211, 238"
    if isinstance(accent_color, str) and re.match(r"^#[0-9a-fA-F]{6}$", accent_color):
        accent_rgb = ", ".join(str(int(accent_color[i:i+2], 16)) for i in (1, 3, 5))

    accent_choices = [
        ("#3b82f6", "Blue"),
        ("#22d3ee", "Cyan"),
        ("#f97316", "Sunset"),
        ("#10b981", "Emerald"),
        ("#ef4444", "Coral")
    ]
    accent_options = "".join(
        f'<option value="{value}" {"selected" if accent_color == value else ""}>{label}</option>'
        for value, label in accent_choices
    )

    model_labels = {model_key: cfg.get("label", model_key) for model_key, cfg in MODELS.items()}
    model_options = "".join(
        f'<option value="{model_key}" {"selected" if current_model == model_key else ""}>{label}</option>'
        for model_key, label in model_labels.items()
    )

    html = f"""
    <!DOCTYPE html>
    <html lang="en" class="{theme_class}" style="--accent: {accent_color}; --accent-rgb: {accent_rgb};">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lumiere - Presentation Mode</title>
        <link rel="stylesheet" href="/static/app.css?v=20260211-13">
        <script src="/static/app.js?v=20260211-13" defer></script>
    </head>
    <body data-current-model="{current_model}" data-accent="{accent_color}" data-user-name="{safe_name}">
        <div class="ambient-layer" aria-hidden="true">
            <div class="ambient-gradient"></div>
            <div class="ambient-grid"></div>
            <div class="ambient-wave ambient-wave-a"></div>
            <div class="ambient-wave ambient-wave-b"></div>
            <div class="orb orb-a"></div>
            <div class="orb orb-b"></div>
            <div class="orb orb-c"></div>
        </div>

        <div class="theme-switcher">
            <div class="theme-actions">
                <button data-theme="light" onclick="setTheme('light')">Light</button>
                <button data-theme="dark" onclick="setTheme('dark')">Dark</button>
                <button data-theme="system" onclick="setTheme('system')">System</button>
            </div>
            <select id="accent-select" onchange="setAccent(this.value)" aria-label="Select accent">
                {accent_options}
            </select>
            <select id="model-select" onchange="setModel(this.value)" aria-label="Select model">
                {model_options}
            </select>
        </div>

        <div class="header">
            <div class="brand-wrap">
                <p class="eyebrow">Evolving AI Companion</p>
                <h1>Lumiere</h1>
                <p>{safe_name}'s presentation-ready command center</p>
            </div>
            <div class="hero-metrics">
                <div class="metric-card">
                    <span>Specialists</span>
                    <strong>{len(squad)}</strong>
                </div>
                <div class="metric-card">
                    <span>Active Model</span>
                    <strong>{model_labels.get(current_model, current_model)}</strong>
                </div>
                <div class="metric-card">
                    <span>Mode</span>
                    <strong>Live Coaching</strong>
                </div>
            </div>
        </div>

        <div class="container">
            <div class="agent-panel">
                <div class="panel-header">Agent Squad <span class="pill">Adaptive</span></div>
                <div class="agent-stats"></div>
                <div class="agent-memory-wrap">
                    <details id="agent-memory-panel" open>
                        <summary>Current Agent Memory</summary>
                        <div id="agent-memory-meta" class="agent-memory-meta"></div>
                        <div id="agent-memory-history" class="agent-memory-history"></div>
                    </details>
                </div>
                <div class="reminder-wrap">
                    <details id="reminder-panel" open>
                        <summary>Reminder Manager</summary>
                        <div class="reminder-input-row">
                            <input id="reminder-input" type="text" placeholder="Add a task/reminder..." autocomplete="off">
                            <button id="reminder-add-btn" type="button">Add</button>
                        </div>
                        <div id="reminder-list" class="reminder-list"></div>
                    </details>
                </div>
                <div class="reminder-wrap">
                    <details id="marketplace-panel" open>
                        <summary>Marketplace (Listed Agents)</summary>
                        <div id="marketplace-list" class="marketplace-list"></div>
                        <div id="marketplace-events" class="marketplace-events"></div>
                    </details>
                </div>
            </div>

            <div class="chat-panel">
                <div class="panel-header">Talk to Lumiere <span class="pill success">Live</span></div>
                <div class="panel-body">
                    <div id="onboarding-banner" class="onboarding-banner">
                        I'm Lumiere, your evolving companion. Ask anything, rate answers, and watch me grow.
                        <button id="onboarding-close" type="button">Dismiss</button>
                    </div>
                    <div id="ai-avatar-block" class="ai-avatar-block" aria-live="polite">
                        <div class="ai-avatar-shell">
                            <div id="ai-avatar-core" class="ai-avatar-core"></div>
                        </div>
                        <div class="ai-avatar-meta">
                            <div class="ai-avatar-title">Lumiere Core</div>
                            <div class="ai-avatar-stats">
                                <span id="ai-avatar-stage">Stage 1</span>
                                <span id="ai-avatar-interactions">0 interactions</span>
                                <button id="avatar-reset-btn" type="button" class="avatar-reset-btn">Reset</button>
                            </div>
                        </div>
                    </div>
                    <div class="utility-row">
                        <div class="actor-switcher">
                            <span>Use As</span>
                            <input id="actor-input" type="text" value="{safe_name}" placeholder="Identity">
                            <button id="actor-apply-btn" type="button">Apply</button>
                        </div>
                        <label class="upload-btn" for="file-upload-input">Upload File</label>
                        <input id="file-upload-input" type="file" accept=".txt,.md,.csv,.json,.pdf,image/*" hidden>
                        <button id="clear-uploaded-btn" type="button">Clear Files</button>
                        <button id="tts-toggle-btn" type="button">TTS Off</button>
                        <button id="export-txt-btn" type="button">Export TXT</button>
                        <button id="export-json-btn" type="button">Export JSON</button>
                    </div>
                    <div id="uploaded-context-list" class="uploaded-context-list"></div>
                    <div class="prompt-row">
                        <button class="prompt-chip" data-prompt="Give me a strong 60-second opening for my presentation.">Opening Script</button>
                        <button class="prompt-chip" data-prompt="Turn this into 3 sharp slide bullets with one example each.">Slide Bullets</button>
                        <button class="prompt-chip" data-prompt="Ask me 5 hard audience questions and ideal answers.">Q&A Rehearsal</button>
                    </div>
                    <div id="chat-output" class="chat-messages"></div>
                    <div id="loading" class="loading">
                        <div class="loading-text">Lumiere is thinking...</div>
                        <div class="loading-dots">
                            <div class="dot"></div>
                            <div class="dot"></div>
                            <div class="dot"></div>
                        </div>
                    </div>
                    <div class="input-area">
                        <input id="question" type="text" placeholder="Ask anything about your presentation, {safe_name}..." autocomplete="off">
                        <button id="voice-btn" type="button" class="voice-btn" title="Voice input">Mic</button>
                        <button id="web-btn" type="button" class="web-btn" title="Live web search">Web</button>
                        <button id="debate-btn" type="button" class="debate-btn" title="Debate mode">Debate</button>
                        <button id="send-btn">Send</button>
                    </div>
                    <div id="remembers-footer" class="remembers-footer">Lumiere remembers: building context...</div>
                </div>
            </div>
        </div>
        <div id="toast" class="toast" role="status" aria-live="polite"></div>
    </body>
    </html>
    """
    return html

@app.get("/ask")
async def ask(q: str, requester: Optional[str] = None):
    print(f"[SERVER] /ask called with question: '{q}'")
    if not q:
        return "Please ask a question."
    acting_as = effective_requester_name(requester)

    q_lower = q.lower()
    specialty = detect_specialty(q_lower)
    print(f"[SERVER] → Routed to {specialty}")

    global last_specialty
    if specialty == "general" and last_specialty != "general":
        specialty = last_specialty
        print(f"[SERVER] Sticky routing: staying with '{specialty}'")
    else:
        last_specialty = specialty

    agent = get_or_create_agent(specialty)
    rental_lock = rental_lock_for_requester(agent.specialty, acting_as)
    if rental_lock:
        renter = rental_lock.get("renter", "another user")
        expires_at = rental_lock.get("expires_at", "soon")
        blocked = f"""
This agent is currently rented by {html_escape(str(renter))} until {html_escape(str(expires_at))}.
You are acting as {html_escape(acting_as)}.
Try another topic/agent or wait for rental expiry.
<small class="answer-meta" data-agent="{agent.specialty}" data-level="{agent.level}">
Rental lock active.
</small>
"""
        return HTMLResponse(content=blocked, media_type="text/html")
    reminder_create = parse_reminder_command(q)
    reminder_ack = ""
    if reminder_create:
        due_at_value = reminder_create.get("due_at")
        reminder_item = {
            "id": str(uuid4())[:8],
            "text": reminder_create.get("task_text", "").strip(),
            "done": False,
            "created_at": datetime.utcnow().isoformat() + "Z",
            "due_at": due_at_value,
        }
        reminders.append(reminder_item)
        save_reminders()
        agent = get_or_create_agent("reminders")
        specialty = "reminders"
        due_msg = f" for {due_at_value}" if due_at_value else ""
        reminder_ack = f"Saved reminder: {reminder_item['text']}{due_msg}."

    memory_summary = agent.get_memory_summary(acting_as)
    reminder_context = ""
    if specialty == "reminders" and reminders:
        reminder_lines = []
        for item in reminders[-8:]:
            status = "done" if item.get("done") else "pending"
            reminder_lines.append(f"- [{status}] {item.get('text', '')}")
        reminder_context = "Current reminder list:\n" + "\n".join(reminder_lines) + "\n"

    tone = level_tone(agent.level)
    upload_context = upload_context_block()
    prompt = f"""
{memory_summary}
{reminder_context}
{upload_context}

You are {agent.name} ({agent.specialty}), Level {agent.level}, {agent.accuracy:.1f}% mastery.
{tone}
Stay in your specialty unless the user clearly changes topic.
If the user asks about previous conversations, reference your memory.
Answer concisely and helpfully: {q}
"""
    print("[SERVER] Sending prompt to LLM...")
    answer_plain = ask_llm(prompt)
    answer = answer_plain
    print(f"[SERVER] LLM returned answer (length: {len(answer)})")

    due_nudges = due_reminder_nudges()
    if due_nudges:
        answer_plain = "\n".join(due_nudges) + "\n\n" + answer_plain
    if reminder_ack:
        answer_plain = reminder_ack + "\n\n" + answer_plain

    memory_line = maybe_memory_callback(agent, acting_as)
    if memory_line:
        answer_plain = f"{memory_line}\n\n{answer_plain}"

    answer = format_ai_text_html(answer_plain)

    agent.add_interaction(q, answer_plain, user_id=acting_as)
    save_agents()
    train_token_from_signal(agent.specialty, usage_inc=1)

    message_id = str(hash(q))

    thumbs_html = f'''
    <div class="thumbs-rating">
        Was this helpful?
        <span class="thumb-up" data-value="1" data-agent="{agent.specialty}" data-message-id="{message_id}" title="Helpful">👍</span>
        <span class="thumb-down" data-value="-1" data-agent="{agent.specialty}" data-message-id="{message_id}" title="Not helpful">👎</span>
    </div>
    '''

    answered_by = f'''
    <small class="answer-meta" data-agent="{agent.specialty}" data-level="{agent.level}">
        Answered by: {agent.name} (Level {agent.level} – {agent.accuracy:.1f}% mastery)
    </small>
    '''

    full_response = answer + thumbs_html + answered_by

    return HTMLResponse(content=full_response, media_type="text/html")

@app.get("/debate")
async def debate(q: str, requester: Optional[str] = None):
    print(f"[SERVER] /debate called with question: '{q}'")
    if not q:
        return "Please provide a topic for debate."
    acting_as = effective_requester_name(requester)

    agent_a, agent_b = choose_debate_agents(q)
    lock_a = rental_lock_for_requester(agent_a.specialty, acting_as)
    lock_b = rental_lock_for_requester(agent_b.specialty, acting_as)
    if lock_a or lock_b:
        blocked_agents = []
        if lock_a:
            blocked_agents.append(f"{agent_a.name} (rented by {lock_a.get('renter', 'another user')})")
        if lock_b:
            blocked_agents.append(f"{agent_b.name} (rented by {lock_b.get('renter', 'another user')})")
        blocked = f"""
Debate unavailable right now because rented agents are locked:
{html_escape(', '.join(blocked_agents))}
You are acting as {html_escape(acting_as)}.
<small class="answer-meta" data-agent="general" data-level="1">
Rental lock active for debate.
</small>
"""
        return HTMLResponse(content=blocked, media_type="text/html")

    memory_a = agent_a.get_memory_summary(acting_as)
    memory_b = agent_b.get_memory_summary(acting_as)
    upload_context = upload_context_block()

    prompt_a = f"""
{memory_a}
{upload_context}

You are {agent_a.name} ({agent_a.specialty}), Level {agent_a.level}, {agent_a.accuracy:.1f}% mastery.
{level_tone(agent_a.level)}
Debate task:
- Take the PRO side and argue for the idea.
- Give 3 concise points with one practical example.
Topic: {q}
"""
    prompt_b = f"""
{memory_b}
{upload_context}

You are {agent_b.name} ({agent_b.specialty}), Level {agent_b.level}, {agent_b.accuracy:.1f}% mastery.
{level_tone(agent_b.level)}
Debate task:
- Take the CAUTIONARY/CON side and challenge the idea.
- Give 3 concise points with one practical example.
Topic: {q}
"""

    answer_a_plain = ask_llm(prompt_a)
    answer_b_plain = ask_llm(prompt_b)

    synth_prompt = f"""
You are Lumiere, a neutral moderator.
Topic: {q}
{upload_context}

Pro side from {agent_a.name}:
{answer_a_plain}

Con side from {agent_b.name}:
{answer_b_plain}

Now provide:
1) Key tradeoff summary (2-3 lines)
2) A balanced recommendation
3) A concrete next step the user can take today
Keep it concise and practical.
"""
    synthesis_plain = ask_llm(synth_prompt)
    due_nudges = due_reminder_nudges()
    if due_nudges:
        synthesis_plain = "\n".join(due_nudges) + "\n\n" + synthesis_plain

    agent_a.add_interaction(f"Debate topic (pro stance): {q}", answer_a_plain, user_id=acting_as)
    agent_b.add_interaction(f"Debate topic (con stance): {q}", answer_b_plain, user_id=acting_as)
    general_agent = get_or_create_agent("general")
    general_agent.add_interaction(f"Debate synthesis topic: {q}", synthesis_plain, user_id=acting_as)
    save_agents()
    train_token_from_signal(agent_a.specialty, usage_inc=1)
    train_token_from_signal(agent_b.specialty, usage_inc=1)
    train_token_from_signal(general_agent.specialty, usage_inc=1)

    pro_html = format_ai_text_html(answer_a_plain)
    con_html = format_ai_text_html(answer_b_plain)
    synthesis_html = format_ai_text_html(synthesis_plain)

    safe_topic = html_escape(q)
    full_response = f"""
    <div class="debate-block">
        <div class="debate-topic">Debate Topic: {safe_topic}</div>
        <div class="debate-column pro">
            <div class="debate-head">Pro: {html_escape(agent_a.name)} ({html_escape(agent_a.specialty)})</div>
            <div>{pro_html}</div>
        </div>
        <div class="debate-column con">
            <div class="debate-head">Con: {html_escape(agent_b.name)} ({html_escape(agent_b.specialty)})</div>
            <div>{con_html}</div>
        </div>
        <div class="debate-column synth">
            <div class="debate-head">Moderator Synthesis</div>
            <div>{synthesis_html}</div>
        </div>
        <small class="answer-meta" data-agent="general" data-level="{general_agent.level}">
            Debate by: {html_escape(agent_a.name)} vs {html_escape(agent_b.name)} · Synthesized by Lumiere
        </small>
    </div>
    """
    return HTMLResponse(content=full_response, media_type="text/html")

@app.get("/ask-live")
async def ask_live(q: str, requester: Optional[str] = None):
    print(f"[SERVER] /ask-live called with question: '{q}'")
    if not q:
        return "Please ask a question."
    acting_as = effective_requester_name(requester)

    specialty = detect_specialty(q.lower())
    if specialty == "general" and last_specialty != "general":
        specialty = last_specialty
    agent = get_or_create_agent(specialty)
    rental_lock = rental_lock_for_requester(agent.specialty, acting_as)
    if rental_lock:
        renter = rental_lock.get("renter", "another user")
        expires_at = rental_lock.get("expires_at", "soon")
        blocked = f"""
Live web answer unavailable for this agent right now.
It is rented by {html_escape(str(renter))} until {html_escape(str(expires_at))}.
You are acting as {html_escape(acting_as)}.
<small class="answer-meta" data-agent="{agent.specialty}" data-level="{agent.level}">
Rental lock active.
</small>
"""
        return HTMLResponse(content=blocked, media_type="text/html")

    upload_context = upload_context_block()
    answer_plain, sources = live_web_answer(q, max_sources=3, extra_context=upload_context)
    if not answer_plain:
        fallback = "I couldn't fetch reliable live web sources right now. Please try again in a moment."
        fallback += """
<small class="answer-meta" data-agent="general" data-level="1">
Live web fetch unavailable.
</small>
"""
        return HTMLResponse(content=fallback, media_type="text/html")

    memory_line = maybe_memory_callback(agent, acting_as)
    due_nudges = due_reminder_nudges()
    if due_nudges:
        answer_plain = "\n".join(due_nudges) + "\n\n" + answer_plain
    if memory_line:
        answer_plain = f"{memory_line}\n\n{answer_plain}"

    answer = format_ai_text_html(answer_plain)
    sources_html = "".join(
        f'<li><a href="{html_escape(item["url"])}" target="_blank" rel="noopener noreferrer">{html_escape(item["title"])}</a></li>'
        for item in sources
    )
    references = f"""
    <div class="web-sources">
        <strong>Live Sources:</strong>
        <ul>{sources_html}</ul>
    </div>
    """

    agent.add_interaction(f"Live web query: {q}", answer_plain, user_id=acting_as)
    save_agents()
    train_token_from_signal(agent.specialty, usage_inc=1)

    message_id = str(hash(f"live:{q}:{datetime.utcnow().isoformat()}"))
    thumbs_html = f'''
    <div class="thumbs-rating">
        Was this helpful?
        <span class="thumb-up" data-value="1" data-agent="{agent.specialty}" data-message-id="{message_id}" title="Helpful">👍</span>
        <span class="thumb-down" data-value="-1" data-agent="{agent.specialty}" data-message-id="{message_id}" title="Not helpful">👎</span>
    </div>
    '''

    answered_by = f'''
    <small class="answer-meta" data-agent="{agent.specialty}" data-level="{agent.level}">
        Live web answer by: {agent.name} (Level {agent.level} – {agent.accuracy:.1f}% mastery)
    </small>
    '''

    full_response = answer + references + thumbs_html + answered_by
    return HTMLResponse(content=full_response, media_type="text/html")

@app.post("/rate")
async def rate(data: dict = Body(...)):
    message_id = data.get("message_id")
    value = data.get("value")
    agent_specialty = data.get("agent")

    if message_id is None or value is None:
        print("[SERVER] Missing message_id or value")
        return {"error": "Missing data"}

    print(f"[SERVER] Rating received: {value} for message {message_id} (agent: {agent_specialty})")

    updated = False
    for agent in squad:
        if agent.specialty == agent_specialty:
            old = agent.accuracy
            agent.accuracy = min(100, max(0, agent.accuracy + value * 1))

            if value > 0:
                agent.positive_ratings += value
                if agent.positive_ratings >= 5:
                    agent.level += 1
                    agent.positive_ratings = 0
                    print(f"[SERVER] {agent.name} leveled up to Level {agent.level}!")

            print(f"[SERVER] Updated {agent.name} ({agent.specialty}) from {old:.1f}% to {agent.accuracy:.1f}%")
            updated = True
            break

    if not updated:
        print(f"[SERVER] Warning: No agent found for specialty '{agent_specialty}'")
    else:
        token = chain_state["tokens"].get(agent_specialty)
        if token:
            if value > 0:
                train_token_from_signal(agent_specialty, rating_value=value, usage_inc=0)
            else:
                token["value_score"] = round(max(0.5, float(token.get("value_score", 1.0)) - 0.04), 3)
                token["last_train_at"] = now_iso()
                save_chain_state()

    save_agents()
    return {"status": "ok"}

@app.get("/agent-stats")
async def get_agent_stats(requester: Optional[str] = None):
    print("[SERVER] /agent-stats called")
    acting_as = effective_requester_name(requester)
    out = []
    for agent in squad:
        token = ensure_agent_token(agent)
        rental = active_rental_for_specialty(agent.specialty)
        out.append({
            "name": agent.name,
            "specialty": agent.specialty,
            "accuracy": agent.accuracy,
            "level": agent.level,
            "recent_messages": agent.get_recent_messages(limit=10, user_id=acting_as),
            "facts": agent.get_facts(user_id=acting_as)[-5:],
            "token": {
                "mint_address": token.get("mint_address"),
                "owner": token.get("owner"),
                "holder": (rental.get("renter") if rental else token.get("owner")),
                "listed": bool(token.get("listed")),
                "list_price_sol": token.get("list_price_sol"),
                "rent_price_sol_per_hour": token.get("rent_price_sol_per_hour"),
                "value_score": token.get("value_score"),
                "train_score": token.get("train_score"),
                "usage_count": token.get("usage_count"),
            },
            "rental": rental,
        })
    return out

@app.get("/agent-memory")
async def agent_memory(specialty: str = "general", limit: int = 10, requester: Optional[str] = None):
    agent = next((a for a in squad if a.specialty == specialty), None)
    if not agent:
        return {"specialty": specialty, "name": "Unknown", "history": [], "facts": []}
    acting_as = effective_requester_name(requester)
    clamped = max(5, min(10, limit))
    return {
        "specialty": agent.specialty,
        "name": agent.name,
        "level": agent.level,
        "history": agent.get_recent_messages(limit=clamped, user_id=acting_as),
        "facts": agent.get_facts(user_id=acting_as)[-5:],
    }

@app.get("/memory-fact")
async def memory_fact(specialty: str = "general", requester: Optional[str] = None):
    acting_as = effective_requester_name(requester)
    pool = []
    focused = next((a for a in squad if a.specialty == specialty), None)
    if focused:
        pool.extend(focused.get_facts(user_id=acting_as))
    for agent in squad:
        pool.extend(agent.get_facts(user_id=acting_as))
    deduped = []
    for fact in pool:
        if fact not in deduped:
            deduped.append(fact)
    if not deduped:
        return {"fact": "No long-term facts yet. Keep chatting and I will learn your preferences."}
    return {"fact": random.choice(deduped)}

@app.get("/reminders")
async def get_reminders():
    return reminders

@app.post("/reminders")
async def add_reminder(data: dict = Body(...)):
    text = str(data.get("text", "")).strip()
    if not text:
        return {"error": "Missing text"}
    parsed_due = parse_due_datetime_from_text(text)
    parsed = parse_reminder_command(f"remind me to {text}") or {
        "task_text": text,
        "due_at": parsed_due.isoformat() if parsed_due else None,
    }
    task_text = parsed.get("task_text", text).strip() or text
    due_at_value = parsed.get("due_at")
    item = {
        "id": str(uuid4())[:8],
        "text": task_text,
        "done": False,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "due_at": due_at_value,
    }
    reminders.append(item)
    save_reminders()
    return {"status": "ok", "item": item, "parsed_due_at": due_at_value}

@app.post("/reminders/{reminder_id}/toggle")
async def toggle_reminder(reminder_id: str):
    for item in reminders:
        if item.get("id") == reminder_id:
            item["done"] = not bool(item.get("done"))
            save_reminders()
            return {"status": "ok", "item": item}
    return {"error": "Not found"}

@app.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str):
    global reminders
    before = len(reminders)
    reminders = [item for item in reminders if item.get("id") != reminder_id]
    if len(reminders) == before:
        return {"error": "Not found"}
    save_reminders()
    return {"status": "ok"}

@app.get("/uploaded-context")
async def get_uploaded_context():
    return uploaded_context[-8:]

@app.delete("/uploaded-context")
async def clear_uploaded_context():
    uploaded_context.clear()
    return {"status": "ok"}

@app.post("/upload-context")
async def upload_context(file: UploadFile = File(...)):
    try:
        data = await file.read()
        file_name = file.filename or "upload.bin"
        content_type = file.content_type or "application/octet-stream"
        if not data:
            return {"error": "Empty file"}

        stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        safe_name = re.sub(r"[^a-zA-Z0-9._-]+", "_", file_name)
        saved_name = f"{stamp}_{safe_name}"
        saved_path = UPLOAD_DIR / saved_name
        with saved_path.open("wb") as f:
            f.write(data)

        summary = summarize_upload_for_context(file_name, content_type, data)
        item = {
            "id": str(uuid4())[:8],
            "name": file_name,
            "content_type": content_type,
            "size": len(data),
            "saved_path": str(saved_path),
            "summary": summary,
            "created_at": datetime.utcnow().isoformat() + "Z",
        }
        uploaded_context.append(item)
        if len(uploaded_context) > 12:
            del uploaded_context[:-12]
        return {"status": "ok", "item": item}
    except Exception as e:
        return {"error": f"Upload failed: {e}"}

@app.get("/chain/state")
async def get_chain_state():
    return chain_state

@app.get("/chain/marketplace")
async def get_chain_marketplace():
    listed = []
    for specialty, token in chain_state.get("tokens", {}).items():
        if token.get("listed"):
            listed.append({
                "specialty": specialty,
                "agent_name": token.get("agent_name"),
                "owner": token.get("owner"),
                "price_sol": token.get("list_price_sol"),
                "mint_address": token.get("mint_address"),
                "value_score": token.get("value_score"),
            })
    listed.sort(key=lambda x: (x.get("price_sol") is None, x.get("price_sol", 0)))
    recent = chain_state.get("tx_log", [])[-12:]
    return {
        "network": chain_state.get("network"),
        "listed": listed,
        "recent_events": recent,
    }

@app.post("/chain/mint-agent")
async def mint_agent_token(data: dict = Body(...)):
    specialty = str(data.get("specialty", "")).strip().lower()
    owner = str(data.get("owner", "")).strip() or (user_name or "local_user")
    if not specialty:
        return {"error": "Missing specialty"}
    agent = next((a for a in squad if a.specialty == specialty), None)
    if not agent:
        return {"error": "Unknown agent specialty"}
    token = ensure_agent_token(agent, owner=owner)
    token["owner"] = owner
    token["mint_address"] = token.get("mint_address") or _mock_sol_mint()
    token["metadata_uri"] = token.get("metadata_uri") or f"mock://lumiere/{specialty}"
    token["listed"] = bool(token.get("listed", False))
    token["value_score"] = round(max(float(token.get("value_score", 1.0)), 1.0), 3)
    save_chain_state()
    return {"status": "ok", "token": token, "network": chain_state.get("network")}

@app.post("/chain/list-agent")
async def list_agent_token(data: dict = Body(...)):
    specialty = str(data.get("specialty", "")).strip().lower()
    seller = str(data.get("seller", "")).strip() or (user_name or "local_user")
    price = data.get("price_sol")
    if not specialty:
        return {"error": "Missing specialty"}
    try:
        price_val = round(float(price), 4)
    except Exception:
        return {"error": "Invalid price_sol"}
    if price_val <= 0:
        return {"error": "price_sol must be > 0"}
    token = chain_state["tokens"].get(specialty)
    if not token:
        return {"error": "Token not minted"}
    if token.get("owner") != seller:
        return {"error": "Only owner can list this token"}
    token["listed"] = True
    token["list_price_sol"] = price_val
    record_chain_event("list", specialty, {"seller": seller, "price_sol": price_val})
    save_chain_state()
    return {"status": "ok", "token": token}

@app.post("/chain/buy-agent")
async def buy_agent_token(data: dict = Body(...)):
    specialty = str(data.get("specialty", "")).strip().lower()
    buyer = str(data.get("buyer", "")).strip()
    if not specialty or not buyer:
        return {"error": "Missing specialty or buyer"}
    token = chain_state["tokens"].get(specialty)
    if not token:
        return {"error": "Token not minted"}
    if not token.get("listed"):
        return {"error": "Token is not listed"}
    seller = token.get("owner")
    token["owner"] = buyer
    token["listed"] = False
    token["list_price_sol"] = None
    token["value_score"] = round(float(token.get("value_score", 1.0)) + 0.05, 3)
    token.setdefault("ownership_history", []).append({
        "owner": buyer,
        "at": now_iso(),
        "reason": "buy",
    })
    record_chain_event("transfer", specialty, {"from": seller, "to": buyer, "method": "buy"})
    save_chain_state()
    return {"status": "ok", "token": token}

@app.post("/chain/rent-agent")
async def rent_agent_token(data: dict = Body(...)):
    specialty = str(data.get("specialty", "")).strip().lower()
    renter = str(data.get("renter", "")).strip()
    hours = data.get("hours", 1)
    if not specialty or not renter:
        return {"error": "Missing specialty or renter"}
    token = chain_state["tokens"].get(specialty)
    if not token:
        return {"error": "Token not minted"}
    active = active_rental_for_specialty(specialty)
    if active:
        return {"error": "Agent is already rented"}
    try:
        hours_val = max(1, int(hours))
    except Exception:
        return {"error": "Invalid hours"}
    expires_at = datetime.utcnow() + timedelta(hours=hours_val)
    rental = {
        "specialty": specialty,
        "owner": token.get("owner"),
        "renter": renter,
        "hours": hours_val,
        "price_sol_per_hour": token.get("rent_price_sol_per_hour", 0.05),
        "started_at": now_iso(),
        "expires_at": expires_at.isoformat(),
    }
    chain_state["rentals"][specialty] = rental
    token["value_score"] = round(float(token.get("value_score", 1.0)) + 0.03, 3)
    record_chain_event("rent", specialty, {"owner": token.get("owner"), "renter": renter, "hours": hours_val})
    save_chain_state()
    return {"status": "ok", "rental": rental, "token": token}

@app.post("/chain/train-agent")
async def train_agent_token(data: dict = Body(...)):
    specialty = str(data.get("specialty", "")).strip().lower()
    signal = int(data.get("signal", 1))
    if not specialty:
        return {"error": "Missing specialty"}
    token = train_token_from_signal(specialty, rating_value=max(0, signal), usage_inc=1)
    if not token:
        return {"error": "Token not found"}
    record_chain_event("train", specialty, {"signal": max(0, signal), "value_score": token.get("value_score")})
    save_chain_state()
    return {"status": "ok", "token": token}

@app.post("/set-theme")
async def set_theme(data: dict):
    global theme
    theme = data.get("theme", "system")
    profile["theme"] = theme
    save_user_profile(profile)
    return {"status": "ok"}

@app.post("/set-accent")
async def set_accent(data: dict):
    global accent_color
    accent_color = data.get("accent", "#3b82f6")
    profile["accent"] = accent_color
    save_user_profile(profile)
    return {"status": "ok"}

@app.post("/set-model")
async def set_model(data: dict):
    global current_model
    model = data.get("model")
    if model in MODELS:
        current_model = model
        profile["model"] = model
        save_user_profile(profile)
        print(f"[SERVER] Model switched to {model}")
        return {"status": "ok", "model": model}
    return {"error": "Invalid model"}

@app.post("/set-name")
async def set_name(name: str = Form(...)):
    global user_name
    user_name = name.strip()
    profile["name"] = user_name
    save_user_profile(profile)
    return RedirectResponse(url="/", status_code=303)

if __name__ == "__main__":
    print("Starting Lumiere...")
    print("Open: http://127.0.0.1:8000")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
