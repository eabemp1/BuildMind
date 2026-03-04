import json
from datetime import datetime, timezone

from sqlalchemy import text

from app.database import engine


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_table() -> None:
    ddl = """
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
    """
    with engine.begin() as con:
        con.execute(text(ddl))


def state_load_json(key: str, default):
    _ensure_table()
    with engine.begin() as con:
        row = con.execute(
            text("SELECT value_json FROM app_state WHERE key = :k"),
            {"k": str(key)},
        ).fetchone()
    if not row:
        return default
    try:
        return json.loads(str(row[0]))
    except Exception:
        return default


def state_save_json(key: str, data) -> None:
    _ensure_table()
    payload = json.dumps(data, ensure_ascii=False)
    now_iso = _utcnow_iso()
    with engine.begin() as con:
        updated = con.execute(
            text("UPDATE app_state SET value_json = :v, updated_at = :u WHERE key = :k"),
            {"k": str(key), "v": payload, "u": now_iso},
        ).rowcount
        if not updated:
            con.execute(
                text("INSERT INTO app_state (key, value_json, updated_at) VALUES (:k, :v, :u)"),
                {"k": str(key), "v": payload, "u": now_iso},
            )

