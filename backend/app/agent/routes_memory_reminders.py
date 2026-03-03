from datetime import datetime
from typing import Optional
from uuid import uuid4
import random

from fastapi import Body, Header


def register_memory_reminder_routes(app, ctx):
    @app.get("/agent-memory")
    async def agent_memory(specialty: str = "personal", limit: int = 10, requester: Optional[str] = None):
        agent = next((a for a in ctx["squad"] if a.specialty == specialty), None)
        if not agent:
            return {"specialty": specialty, "name": "Unknown", "history": [], "facts": []}
        acting_as = ctx["effective_requester_name"](requester)
        clamped = max(5, min(10, limit))
        return {
            "specialty": agent.specialty,
            "name": agent.name,
            "level": agent.level,
            "history": agent.get_recent_messages(limit=clamped, user_id=acting_as),
            "facts": agent.get_facts(user_id=acting_as)[-5:],
        }

    @app.get("/memory-fact")
    async def memory_fact(specialty: str = "personal", requester: Optional[str] = None):
        priority = ctx["reminder_priority_fact"]()
        if priority:
            return {"fact": priority}
        acting_as = ctx["effective_requester_name"](requester)
        pool = []
        focused = next((a for a in ctx["squad"] if a.specialty == specialty), None)
        if focused:
            pool.extend(focused.get_facts(user_id=acting_as))
        for agent in ctx["squad"]:
            pool.extend(agent.get_facts(user_id=acting_as))
        deduped = []
        for fact in pool:
            if fact not in deduped:
                deduped.append(fact)
        if not deduped:
            return {"fact": "No long-term facts yet. Keep chatting and I will learn your preferences."}
        return {"fact": ctx["personalize_fact_for_actor"](random.choice(deduped), acting_as)}

    @app.get("/reminders")
    async def get_reminders():
        return ctx["reminders"]

    @app.get("/reminders/due")
    async def get_due_reminders(channel: str = "browser", max_items: int = 5):
        key = "last_browser_alert_at" if channel != "native" else "last_native_alert_at"
        cooldown = 3 if channel != "native" else 20
        items = ctx["collect_due_reminders_for_channel"](
            mark_field=key,
            cooldown_minutes=cooldown,
            max_items=max_items,
        )
        return {"items": items, "channel": channel}

    @app.post("/reminders")
    async def add_reminder(data: dict = Body(...)):
        text = str(data.get("text", "")).strip()
        requester = ctx["effective_requester_name"](data.get("requester"))
        if not text:
            return {"error": "Missing text"}
        parsed_due = ctx["parse_due_datetime_from_text"](text)
        parsed = ctx["parse_reminder_command"](f"remind me to {text}") or {
            "task_text": text,
            "due_at": parsed_due.isoformat() if parsed_due else None,
        }
        task_text = parsed.get("task_text", text).strip() or text
        due_at_value = parsed.get("due_at")
        item = {
            "id": str(uuid4())[:8],
            "text": task_text,
            "done": False,
            "created_at": datetime.now().isoformat() + "Z",
            "due_at": due_at_value,
        }
        ctx["reminders"].append(item)
        ctx["save_reminders"]()
        ctx["eval_inc"](requester, "reminder_total", 1)
        ctx["eval_inc"](requester, "task_success", 1)
        return {"status": "ok", "item": item, "parsed_due_at": due_at_value}

    @app.post("/reminders/{reminder_id}/toggle")
    async def toggle_reminder(reminder_id: str, requester: Optional[str] = None):
        now = datetime.now()
        actor = ctx["effective_requester_name"](requester)
        for item in ctx["reminders"]:
            if item.get("id") == reminder_id:
                item["done"] = not bool(item.get("done"))
                if item["done"]:
                    item["completed_at"] = now.isoformat()
                    due_raw = item.get("due_at")
                    if due_raw:
                        try:
                            due = datetime.fromisoformat(str(due_raw))
                            if due >= now:
                                ctx["eval_inc"](actor, "reminder_correct", 1)
                        except Exception:
                            pass
                ctx["save_reminders"]()
                return {"status": "ok", "item": item}
        return {"error": "Not found"}

    @app.delete("/reminders/{reminder_id}")
    async def delete_reminder(reminder_id: str):
        reminders = ctx["reminders"]
        before = len(reminders)
        reminders[:] = [item for item in reminders if item.get("id") != reminder_id]
        if len(reminders) == before:
            return {"error": "Not found"}
        ctx["save_reminders"]()
        return {"status": "ok"}

    @app.get("/uploaded-context")
    async def get_uploaded_context():
        return ctx["uploaded_context"][-8:]

    @app.post("/session/new")
    async def new_chat_session(data: dict = Body(...), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](data.get("requester"), x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        cleared_agents = ctx["clear_recent_history_for_actor"](acting_as)
        ctx["uploaded_context"].clear()
        ctx["log_event"](ctx["logging"].INFO, "session_new", requester=acting_as, cleared_agents=cleared_agents)
        return {"status": "ok", "requester": acting_as, "cleared_agents": cleared_agents}

    @app.get("/memory/scopes")
    async def get_memory_scopes(requester: Optional[str] = None, x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](requester, x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        return {"requester": acting_as, "active_scopes": ctx["get_active_scopes"](acting_as), "available_scopes": ctx["DEFAULT_MEMORY_SCOPES"]}

    @app.post("/memory/scopes")
    async def set_memory_scopes(data: dict = Body(...), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, auth_ctx = ctx["resolve_requester_with_auth"](data.get("requester"), x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        scopes = data.get("active_scopes", [])
        updated = ctx["set_active_scopes"](acting_as, scopes)
        ctx["eval_inc"](acting_as, "memory_edits", 1)
        ctx["audit_log"](
            "memory_scopes_set",
            acting_as,
            metadata={"active_scopes": updated.get("active_scopes", [])},
            tenant_id=(auth_ctx or {}).get("tenant_id", "default"),
        )
        return {"status": "ok", "requester": acting_as, "active_scopes": updated.get("active_scopes", [])}

    @app.get("/memory/items")
    async def list_memory_items(requester: Optional[str] = None, scope: str = "", x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](requester, x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        scopes = [scope] if str(scope).strip() else []
        items = ctx["get_memory_items_for_actor"](acting_as, scopes=scopes if scopes else None)
        return {"requester": acting_as, "items": items}

    @app.post("/memory/items")
    async def create_memory_item(data: dict = Body(...), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, auth_ctx = ctx["resolve_requester_with_auth"](data.get("requester"), x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        item = ctx["upsert_memory_item"](
            acting_as,
            text=data.get("text", ""),
            scope=data.get("scope", "personal"),
            confidence=data.get("confidence", 0.75),
            source=data.get("source", "manual"),
        )
        if not item:
            return {"error": "Invalid memory item"}
        ctx["eval_inc"](acting_as, "memory_edits", 1)
        ctx["eval_inc"](acting_as, "memory_accept", 1)
        ctx["audit_log"](
            "memory_item_create",
            acting_as,
            metadata={"memory_id": item.get("id"), "scope": item.get("scope")},
            tenant_id=(auth_ctx or {}).get("tenant_id", "default"),
        )
        return {"status": "ok", "item": item}

    @app.patch("/memory/items/{memory_id}")
    async def patch_memory_item(memory_id: str, data: dict = Body(...), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, auth_ctx = ctx["resolve_requester_with_auth"](data.get("requester"), x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        item = ctx["update_memory_item"](
            acting_as,
            memory_id,
            text=data.get("text") if "text" in data else None,
            scope=data.get("scope") if "scope" in data else None,
            confidence=data.get("confidence") if "confidence" in data else None,
        )
        if not item:
            ctx["eval_inc"](acting_as, "memory_reject", 1)
            return {"error": "Memory not found"}
        ctx["eval_inc"](acting_as, "memory_edits", 1)
        ctx["eval_inc"](acting_as, "memory_accept", 1)
        ctx["audit_log"](
            "memory_item_patch",
            acting_as,
            metadata={"memory_id": memory_id},
            tenant_id=(auth_ctx or {}).get("tenant_id", "default"),
        )
        return {"status": "ok", "item": item}

    @app.delete("/memory/items/{memory_id}")
    async def remove_memory_item(memory_id: str, requester: Optional[str] = None, x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, auth_ctx = ctx["resolve_requester_with_auth"](requester, x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        ok = ctx["delete_memory_item"](acting_as, memory_id)
        if not ok:
            ctx["eval_inc"](acting_as, "memory_reject", 1)
            return {"error": "Memory not found"}
        ctx["eval_inc"](acting_as, "memory_edits", 1)
        ctx["eval_inc"](acting_as, "memory_accept", 1)
        ctx["audit_log"](
            "memory_item_delete",
            acting_as,
            metadata={"memory_id": memory_id},
            tenant_id=(auth_ctx or {}).get("tenant_id", "default"),
        )
        return {"status": "ok"}

    @app.post("/memory/feedback")
    async def memory_feedback(data: dict = Body(...), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](data.get("requester"), x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        helpful = bool(data.get("helpful", True))
        ctx["eval_inc"](acting_as, "memory_edits", 1)
        if helpful:
            ctx["eval_inc"](acting_as, "memory_accept", 1)
        else:
            ctx["eval_inc"](acting_as, "memory_reject", 1)
        return {"status": "ok"}

    @app.post("/memory/reset")
    async def reset_memory(data: dict = Body(...)):
        acting_as = ctx["effective_requester_name"](data.get("requester"))
        clear_reminders = bool(data.get("clear_reminders", False))
        cleared_agents = ctx["clear_full_memory_for_actor"](acting_as)
        ctx["uploaded_context"].clear()
        reminders_removed = 0
        if clear_reminders:
            reminders_removed = len(ctx["reminders"])
            ctx["reminders"].clear()
            ctx["save_reminders"]()
        ctx["log_event"](
            ctx["logging"].INFO,
            "memory_reset",
            requester=acting_as,
            cleared_agents=cleared_agents,
            reminders_removed=reminders_removed,
        )
        return {
            "status": "ok",
            "requester": acting_as,
            "cleared_agents": cleared_agents,
            "reminders_removed": reminders_removed,
        }

