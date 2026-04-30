"""
app/agent/forge.py — Forge / evolution features

Extracted from runtime.py (Section 9, ~L799–936 + L3500–4500).
Covers: forge state, checkpoints, regression suite, evolution events,
        open-weight tool stubs, dataset snapshot builder.

Import from here; do NOT add new forge logic to runtime.py.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.agent.runtime import (
    FORGE_STATE_FILE,
    CHECKPOINT_DIR,
    DATASET_DIR,
    log_event,
    _json_load,
    _json_save,
    emit_global_event,
    build_dataset_snapshot,
)

logger = logging.getLogger(__name__)

# Module-level forge state mirror (runtime.py still holds the canonical dict;
# this module exposes typed accessors so callers don't touch raw dicts directly).
forge_state: dict = {}

def load_forge_state():
    data = _json_load(FORGE_STATE_FILE, {"actors": {}})
    if not isinstance(data, dict):
        return {"actors": {}}
    data.setdefault("actors", {})
    return data

def save_forge_state():
    _json_save(FORGE_STATE_FILE, forge_state)

def create_checkpoint(dataset_path: str, created_by: str, notes: str = ""):
    cp_id = f"cp_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{str(uuid4())[:6]}"
    src = Path(dataset_path)
    if not src.exists():
        return None, "Dataset path not found"
    target = CHECKPOINT_DIR / f"{cp_id}.json"
    try:
        raw = _json_load(src, {})
        checkpoint_payload = {
            "checkpoint_id": cp_id,
            "created_at": now_iso(),
            "created_by": created_by,
            "notes": str(notes or "")[:400],
            "dataset_source": str(src),
            "dataset_summary": raw if isinstance(raw, dict) else {"raw_type": str(type(raw))},
            "status": "candidate",
        }
        _json_save(target, checkpoint_payload)
        entry = {
            "id": cp_id,
            "created_at": checkpoint_payload["created_at"],
            "created_by": created_by,
            "notes": checkpoint_payload["notes"],
            "dataset_source": str(src),
            "path": str(target),
            "status": "candidate",
        }
        checkpoints_state.setdefault("checkpoints", []).append(entry)
        save_checkpoints()
        return entry, None
    except Exception as e:
        return None, str(e)

def run_regression_suite():
    checks = []
    add = parse_reminder_command("remind me to call team at 11am")
    checks.append({"name": "parse_reminder_add", "pass": bool(add and add.get("task_text"))})
    dele = parse_reminder_delete_command("remove overdue reminders")
    checks.append({"name": "parse_reminder_delete", "pass": bool(dele and dele.get("mode") == "overdue")})
    cat, spec, _ = detect_category_and_specialty("crypto bullish momentum and portfolio")
    checks.append({"name": "routing_finance", "pass": bool(cat == "finance" and spec == "finance")})
    scopes = get_active_scopes("local_user")
    checks.append({"name": "memory_scopes_default", "pass": bool(isinstance(scopes, list) and len(scopes) >= 1)})
    all_pass = all(c.get("pass") for c in checks)
    return {
        "ts": now_iso(),
        "passed": all_pass,
        "total": len(checks),
        "passed_count": sum(1 for c in checks if c.get("pass")),
        "checks": checks,
    }

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
    "ollama-qwen25-14b": {
        "provider": "ollama",
        "model": "qwen2.5:14b",
        "api_key": None,
        "label": "Ollama Qwen 25 14B Local Free"
    },
    "ollama-qwen25-latest": {
        "provider": "ollama",
        "model": "qwen2.5:latest",
        "api_key": None,
        "label": "Ollama Qwen 25 Latest Local Free"
    },
    "ollama-mistral-latest": {
        "provider": "ollama",
        "model": "mistral:latest",
        "api_key": None,
        "label": "Ollama Mistral Latest Local Free"
    },
    "ollama-llama32-latest": {
        "provider": "ollama",
        "model": "llama3.2:latest",
        "api_key": None,
        "label": "Ollama Llama 32 Latest Local Free"
    },
    "ollama-qwen25-coder-14b": {
        "provider": "ollama",
        "model": "qwen2.5-coder:14b",
        "api_key": None,
        "label": "Ollama Qwen 25 Coder 14B Local Free"
    },
    "ollama-deepseek-coder-v2-16b": {
        "provider": "ollama",
        "model": "deepseek-coder-v2:16b",
        "api_key": None,
        "label": "Ollama DeepSeek Coder V2 16B Local Free"
    }
}

MODEL_KEY_ALIASES = {
    "ollama-qwen2.5-14b": "ollama-qwen25-14b",
    "ollama-qwen2.5-latest": "ollama-qwen25-latest",
    "ollama-llama3.2-latest": "ollama-llama32-latest",
    "ollama-qwen2.5-coder-14b": "ollama-qwen25-coder-14b",
}

