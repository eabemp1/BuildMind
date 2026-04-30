"""
app/agent/memory.py — Fact extraction and memory system

Extracted from runtime.py (Section 5, ~L564–798, ~L900–1300).
Covers: memory items CRUD, memory scopes, semantic search,
        checkpoint save/restore, eval metrics.

Import from here; do NOT add new memory logic to runtime.py.
"""

import json
import hashlib
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.agent.runtime import (
    APP_DB,
    MEMORY_ITEMS_FILE,
    MEMORY_SCOPES_FILE,
    log_event,
)

logger = logging.getLogger(__name__)

def load_memory_items():
    data = _json_load(MEMORY_ITEMS_FILE, {"actors": {}})
    if not isinstance(data, dict):
        return {"actors": {}}
    data.setdefault("actors", {})
    return data

def save_memory_items():
    _json_save(MEMORY_ITEMS_FILE, memory_items_state)

def load_memory_scopes():
    data = _json_load(MEMORY_SCOPES_FILE, {"actors": {}})
    if not isinstance(data, dict):
        return {"actors": {}}
    data.setdefault("actors", {})
    return data

def save_memory_scopes():
    _json_save(MEMORY_SCOPES_FILE, memory_scopes_state)

DEFAULT_MEMORY_SCOPES = ["personal", "work", "project", "learning", "finance", "health", "temporary", "global"]

def get_active_scopes(actor_name: str):
    actor_key = normalize_actor_key(actor_name)
    row = memory_scopes_state.get("actors", {}).get(actor_key, {})
    scopes = row.get("active_scopes") if isinstance(row, dict) else None
    if isinstance(scopes, list) and scopes:
        out = [slugify_specialty(x) for x in scopes if str(x).strip()]
        return out or ["personal", "global"]
    return ["personal", "global"]

def set_active_scopes(actor_name: str, scopes):
    actor_key = normalize_actor_key(actor_name)
    normalized = [slugify_specialty(x) for x in (scopes or []) if str(x).strip()]
    if not normalized:
        normalized = ["personal", "global"]
    memory_scopes_state.setdefault("actors", {})[actor_key] = {
        "active_scopes": list(dict.fromkeys(normalized)),
        "updated_at": now_iso(),
    }
    save_memory_scopes()
    return memory_scopes_state["actors"][actor_key]

def get_memory_items_for_actor(actor_name: str, scopes=None):
    actor_key = normalize_actor_key(actor_name)
    items = memory_items_state.get("actors", {}).get(actor_key, [])
    if not isinstance(items, list):
        return []
    scope_filter = [slugify_specialty(x) for x in (scopes or []) if str(x).strip()]
    if scope_filter:
        return [x for x in items if slugify_specialty(x.get("scope", "personal")) in scope_filter]
    return items

def upsert_memory_item(actor_name: str, text: str, scope="personal", confidence=0.7, source="manual"):
    actor_key = normalize_actor_key(actor_name)
    row = memory_items_state.setdefault("actors", {}).setdefault(actor_key, [])
    item = {
        "id": str(uuid4())[:10],
        "text": str(text or "").strip()[:400],
        "scope": slugify_specialty(scope or "personal"),
        "confidence": max(0.0, min(1.0, float(confidence or 0.7))),
        "source": str(source or "manual")[:40],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    if not item["text"]:
        return None
    row.append(item)
    if len(row) > 500:
        memory_items_state["actors"][actor_key] = row[-500:]
    save_memory_items()
    return item

def update_memory_item(actor_name: str, memory_id: str, text=None, scope=None, confidence=None):
    actor_key = normalize_actor_key(actor_name)
    row = memory_items_state.get("actors", {}).get(actor_key, [])
    for item in row:
        if str(item.get("id")) == str(memory_id):
            if text is not None:
                item["text"] = str(text).strip()[:400]
            if scope is not None:
                item["scope"] = slugify_specialty(scope)
            if confidence is not None:
                item["confidence"] = max(0.0, min(1.0, float(confidence)))
            item["updated_at"] = now_iso()
            save_memory_items()
            return item
    return None

def delete_memory_item(actor_name: str, memory_id: str):
    actor_key = normalize_actor_key(actor_name)
    row = memory_items_state.get("actors", {}).get(actor_key, [])
    kept = [x for x in row if str(x.get("id")) != str(memory_id)]
    if len(kept) == len(row):
        return False
    memory_items_state["actors"][actor_key] = kept
    save_memory_items()
    return True

def scoped_memory_context(actor_name: str, limit=10):
    scopes = get_active_scopes(actor_name)
    items = get_memory_items_for_actor(actor_name, scopes=scopes)
    if not items:
        return ""
    ranked = sorted(items, key=lambda x: float(x.get("confidence", 0.5)), reverse=True)
    lines = []
    for item in ranked[:max(1, min(30, int(limit or 10)))]:
        lines.append(f"- [{item.get('scope', 'personal')}] {item.get('text', '')}")
    return "Scoped memory:\n" + "\n".join(lines) + "\n"

def semantic_history_search(actor_name: str, query: str, limit=8):
    q_tokens = set(tokenize_text(query))
    if not q_tokens:
        return []
    query_text = str(query or "").lower()
    allow_old = any(tok in query_text for tok in ["last year", "months ago", "previously", "in 20", "back then", "earlier"])
    cutoff = datetime.now(timezone.utc) - timedelta(days=STALE_HISTORY_DAYS)
    actor_key = normalize_actor_key(actor_name)
    rows = [x for x in chat_history if normalize_actor_key(x.get("requester")) == actor_key]
    hits = []
    for sess in rows:
        sid = str(sess.get("id", ""))
        title = str(sess.get("title", ""))
        for m in (sess.get("messages", []) or []):
            content = str(m.get("content_text", ""))
            msg_dt = _iso_to_datetime(m.get("ts"))
            if not allow_old and msg_dt is not None and msg_dt.astimezone(timezone.utc) < cutoff:
                continue
            tokens = set(tokenize_text(content + " " + title))
            if not tokens:
                continue
            overlap = len(q_tokens & tokens)
            if overlap <= 0:
                continue
            score = overlap / max(1, len(q_tokens | tokens))
            hits.append({
                "score": score,
                "session_id": sid,
                "title": title,
                "ts": m.get("ts"),
                "label": m.get("label", "Lumiere"),
                "content_text": content[:600],
            })
    hits.sort(key=lambda x: (x["score"], str(x.get("ts", ""))), reverse=True)
    return hits[:max(1, min(50, int(limit or 8)))]

def history_retrieval_context(actor_name: str, query: str, limit=4):
    hits = semantic_history_search(actor_name, query, limit=limit)
    if not hits:
        return ""
    lines = []
    for h in hits:
        lines.append(f"- ({h.get('session_id')}) {h.get('label')}: {h.get('content_text')}")
    return "Relevant history snippets:\n" + "\n".join(lines) + "\n"

def history_session_context(actor_name: str, session_id: str, limit=8):
    actor_key = normalize_actor_key(actor_name)
    sid = str(session_id or "").strip()
    if not sid:
        return ""
    sess = next((x for x in chat_history if str(x.get("id")) == sid and normalize_actor_key(x.get("requester")) == actor_key), None)
    if not sess:
        return ""
    messages = sess.get("messages", []) or []
    if not messages:
        return ""
    lines = []
    for m in messages[-max(1, min(30, int(limit or 8))):]:
        lines.append(f"- ({sid}) {m.get('label', 'Lumiere')}: {str(m.get('content_text', ''))[:400]}")
    return "Resumed session context:\n" + "\n".join(lines) + "\n"

def load_eval_metrics():
    data = _json_load(EVAL_METRICS_FILE, {"actors": {}})
    if not isinstance(data, dict):
        return {"actors": {}}
    data.setdefault("actors", {})
    return data

def save_eval_metrics():
    _json_save(EVAL_METRICS_FILE, eval_metrics_state)

def eval_actor_bucket(actor_name: str):
    actor_key = normalize_actor_key(actor_name)
    row = eval_metrics_state.setdefault("actors", {}).setdefault(actor_key, {
        "ai_answers": 0,
        "ratings_up": 0,
        "ratings_down": 0,
        "task_success": 0,
        "task_fail": 0,
        "reminder_total": 0,
        "reminder_correct": 0,
        "memory_edits": 0,
        "memory_accept": 0,
        "memory_reject": 0,
        "hallucination_reports": 0,
        "updated_at": now_iso(),
    })
    return row

def eval_inc(actor_name: str, field: str, amount=1):
    row = eval_actor_bucket(actor_name)
    row[field] = int(row.get(field, 0)) + int(amount)
    row["updated_at"] = now_iso()
    save_eval_metrics()
    return row

def eval_report(actor_name: str):
    row = eval_actor_bucket(actor_name)
    ratings_total = max(1, int(row.get("ratings_up", 0)) + int(row.get("ratings_down", 0)))
    tasks_total = max(1, int(row.get("task_success", 0)) + int(row.get("task_fail", 0)))
    memories_total = max(1, int(row.get("memory_accept", 0)) + int(row.get("memory_reject", 0)))
    ai_answers = max(1, int(row.get("ai_answers", 0)))
    return {
        "actor": normalize_actor_key(actor_name),
        "metrics": row,
        "hard_metrics": {
            "task_success_rate": round(float(row.get("task_success", 0)) / tasks_total, 4),
            "reminder_correctness_rate": round(float(row.get("reminder_correct", 0)) / max(1, int(row.get("reminder_total", 0))), 4),
            "memory_precision_rate": round(float(row.get("memory_accept", 0)) / memories_total, 4),
            "hallucination_rate": round(float(row.get("hallucination_reports", 0)) / ai_answers, 4),
            "rating_positive_rate": round(float(row.get("ratings_up", 0)) / ratings_total, 4),
        },
    }

def load_checkpoints():
    data = _json_load(CHECKPOINT_FILE, {"checkpoints": [], "active_checkpoint_id": None})
    if not isinstance(data, dict):
        return {"checkpoints": [], "active_checkpoint_id": None}
    data.setdefault("checkpoints", [])
    data.setdefault("active_checkpoint_id", None)
    return data

def save_checkpoints():
    _json_save(CHECKPOINT_FILE, checkpoints_state)

