from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4
import json

from fastapi import Body, Header


def register_auth_routes(app, ctx):
    @app.post("/auth/register")
    async def auth_register(data: dict = Body(...)):
        username = str(data.get("username", "")).strip()
        password = str(data.get("password", "")).strip()
        role = str(data.get("role", "user")).strip().lower() or "user"
        tenant_id = str(data.get("tenant_id", "default")).strip() or "default"
        if not username or len(username) < 3:
            return {"error": "Invalid username"}
        if not password or len(password) < 6:
            return {"error": "Password must be at least 6 characters"}
        if ctx["find_user"](username):
            return {"error": "User already exists"}
        if role not in {"user", "admin"}:
            role = "user"
        row = {
            "username": username,
            "password_hash": ctx["password_hash"](password),
            "role": role,
            "tenant_id": tenant_id,
            "created_at": ctx["now_iso"](),
        }
        ctx["users_state"].setdefault("users", []).append(row)
        ctx["save_users"]()
        ctx["audit_log"]("auth_register", username, metadata={"role": role, "tenant_id": tenant_id}, tenant_id=tenant_id)
        return {"status": "ok", "user": {"username": username, "role": role, "tenant_id": tenant_id}}

    @app.post("/auth/login")
    async def auth_login(data: dict = Body(...)):
        username = str(data.get("username", "")).strip()
        password = str(data.get("password", "")).strip()
        user = ctx["find_user"](username)
        if not user or user.get("password_hash") != ctx["password_hash"](password):
            ctx["audit_log"]("auth_login", username or "unknown", status="denied", metadata={"reason": "invalid_credentials"})
            return {"error": "Invalid credentials"}
        token = str(uuid4())
        expires_at = (datetime.now(timezone.utc) + timedelta(hours=ctx["AUTH_SESSION_TTL_HOURS"])).isoformat()
        ctx["auth_sessions_state"].setdefault("sessions", {})[token] = {
            "username": user.get("username"),
            "created_at": ctx["now_iso"](),
            "last_seen_at": ctx["now_iso"](),
            "expires_at": expires_at,
        }
        ctx["save_auth_sessions"]()
        ctx["audit_log"]("auth_login", user.get("username"), metadata={"role": user.get("role")}, tenant_id=user.get("tenant_id", "default"))
        return {
            "status": "ok",
            "token": token,
            "expires_at": expires_at,
            "user": {"username": user.get("username"), "role": user.get("role", "user"), "tenant_id": user.get("tenant_id", "default")},
        }

    @app.post("/auth/refresh")
    async def auth_refresh(x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        ctx_row = ctx["auth_context_from_token"](x_auth_token)
        if not ctx_row:
            return {"error": "Invalid or expired token"}
        tok = ctx_row["token"]
        row = ctx["auth_sessions_state"].get("sessions", {}).get(tok)
        if not isinstance(row, dict):
            return {"error": "Invalid or expired token"}
        row["expires_at"] = (datetime.now(timezone.utc) + timedelta(hours=ctx["AUTH_SESSION_TTL_HOURS"])).isoformat()
        row["last_seen_at"] = ctx["now_iso"]()
        ctx["save_auth_sessions"]()
        return {"status": "ok", "expires_at": row["expires_at"]}

    @app.post("/auth/logout")
    async def auth_logout(x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        ctx_row = ctx["auth_context_from_token"](x_auth_token)
        if not ctx_row:
            return {"error": "Invalid token"}
        ctx["auth_sessions_state"].get("sessions", {}).pop(ctx_row["token"], None)
        ctx["save_auth_sessions"]()
        ctx["audit_log"]("auth_logout", ctx_row["username"], tenant_id=ctx_row.get("tenant_id", "default"))
        return {"status": "ok"}

    @app.get("/auth/me")
    async def auth_me(x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        ctx_row = ctx["auth_context_from_token"](x_auth_token)
        if not ctx_row:
            return {"authenticated": False}
        return {
            "authenticated": True,
            "user": {"username": ctx_row["username"], "role": ctx_row["role"], "tenant_id": ctx_row["tenant_id"]},
            "expires_at": ctx_row.get("expires_at"),
        }

    @app.get("/auth/mode")
    async def auth_mode():
        return {"auth_required": bool(ctx["auth_mode_state"].get("auth_required", False)), "updated_at": ctx["auth_mode_state"].get("updated_at")}

    @app.post("/auth/mode")
    async def set_auth_mode(data: dict = Body(...), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        desired = bool(data.get("auth_required", False))
        users = ctx["users_state"].get("users", [])
        auth_ctx = ctx["auth_context_from_token"](x_auth_token)
        if users and (not auth_ctx or auth_ctx.get("role") != "admin"):
            return {"error": "Admin token required"}
        ctx["auth_mode_state"]["auth_required"] = desired
        ctx["save_auth_mode"]()
        actor = (auth_ctx or {}).get("username", "bootstrap")
        tenant = (auth_ctx or {}).get("tenant_id", "default")
        ctx["audit_log"]("auth_mode_set", actor, metadata={"auth_required": desired}, tenant_id=tenant)
        return {"status": "ok", "auth_required": desired}

    @app.get("/audit/logs")
    async def get_audit_logs(limit: int = 100, x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        auth_ctx = ctx["auth_context_from_token"](x_auth_token)
        if not auth_ctx or auth_ctx.get("role") != "admin":
            return {"error": "Admin token required"}
        out = []
        if ctx["AUDIT_LOG_FILE"].exists():
            with ctx["AUDIT_LOG_FILE"].open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        out.append(json.loads(line))
                    except Exception:
                        continue
        return {"items": out[-max(1, min(1000, int(limit or 100))):]}


