"""Consolidated agent-facing API route registration.

This module centralizes all legacy agent_* route registration helpers so
runtime wiring imports a single routes module.
"""
import json
import random
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

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
        return {"items": ctx["load_audit_logs"](limit)}

FORGE_AGENT_DEFAULTS = {
    "idea_validation": {"name": "Idea Validation Agent", "weight": 0.18},
    "execution_roadmap": {"name": "Execution Roadmap Agent", "weight": 0.24},
    "confidence_reinforcement": {"name": "Confidence Reinforcement Agent", "weight": 0.18},
    "local_resource": {"name": "Local Resource Agent", "weight": 0.16},
    "discernment": {"name": "Discernment Agent", "weight": 0.12},
    "impact_analytics": {"name": "Impact Analytics Agent", "weight": 0.12},
}

EXECUTION_SCORE_WEIGHTS = {
    "task_completion_rate": 0.30,
    "consistency_index": 0.20,
    "confidence_delta": 0.20,
    "milestone_verification_score": 0.20,
    "resource_engagement_score": 0.10,
}


def _forge_clamp(val, low=0.0, high=1.0):
    return max(low, min(high, float(val)))


def _forge_iso_to_dt(value):
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return None


def _forge_map_agent(agent_key: str):
    key = str(agent_key or "").strip().lower()
    if key in FORGE_AGENT_DEFAULTS:
        return key
    legacy = {
        "business": "execution_roadmap",
        "career": "execution_roadmap",
        "finance": "execution_roadmap",
        "reminders": "execution_roadmap",
        "legal": "execution_roadmap",
        "travel": "local_resource",
        "language": "local_resource",
        "personal": "confidence_reinforcement",
        "health": "confidence_reinforcement",
        "education": "idea_validation",
        "science": "idea_validation",
        "math": "idea_validation",
        "coding": "idea_validation",
    }
    return legacy.get(key, "execution_roadmap")


def _forge_actor_bucket(forge_state, normalize_actor_key, now_iso, actor_name: str):
    key = normalize_actor_key(actor_name)
    actors = forge_state.setdefault("actors", {})
    if key not in actors or not isinstance(actors.get(key), dict):
        actors[key] = {
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "metrics": {
                "tasks_completed": 0,
                "tasks_total": 0,
                "milestones_verified": 0,
                "milestones_total": 0,
                "resource_engagements": 0,
                "confidence_baseline": None,
                "confidence_latest": None,
                "active_days": [],
            },
            "agent_mastery": {k: 1.0 for k in FORGE_AGENT_DEFAULTS},
            "events": [],
            "score_history": [],
            "discernment": {
                "mentor_redirects": 0,
                "offline_validation_prompts": 0,
                "dependency_limiter_prompts": 0,
            },
        }
    row = actors[key]
    row.setdefault("metrics", {})
    row.setdefault("agent_mastery", {})
    row.setdefault("events", [])
    row.setdefault("score_history", [])
    row.setdefault("discernment", {})
    for a in FORGE_AGENT_DEFAULTS:
        row["agent_mastery"][a] = float(row["agent_mastery"].get(a, 1.0) or 1.0)
    row["updated_at"] = now_iso()
    return row


def _forge_record_active_day(metrics, ts: str):
    dt = _forge_iso_to_dt(ts) or datetime.now(timezone.utc)
    day_key = dt.astimezone(timezone.utc).strftime("%Y-%m-%d")
    active = metrics.setdefault("active_days", [])
    if day_key not in active:
        active.append(day_key)
        if len(active) > 120:
            del active[:-120]


def _forge_components(row):
    m = row.get("metrics", {})
    tasks_total = max(1, int(m.get("tasks_total", 0)))
    task_completion_rate = _forge_clamp(float(m.get("tasks_completed", 0)) / tasks_total)

    active_days = m.get("active_days", []) if isinstance(m.get("active_days"), list) else []
    consistency_index = _forge_clamp(float(len(active_days[-14:])) / 14.0)

    baseline = m.get("confidence_baseline")
    latest = m.get("confidence_latest")
    if baseline is None or latest is None:
        confidence_delta = 0.5
    else:
        delta = (float(latest) - float(baseline)) / 100.0
        confidence_delta = _forge_clamp((delta + 1.0) / 2.0)

    milestones_total = max(1, int(m.get("milestones_total", 0)))
    milestone_verification_score = _forge_clamp(float(m.get("milestones_verified", 0)) / milestones_total)

    resource_engagement_score = _forge_clamp(float(m.get("resource_engagements", 0)) / 10.0)

    return {
        "task_completion_rate": round(task_completion_rate, 4),
        "consistency_index": round(consistency_index, 4),
        "confidence_delta": round(confidence_delta, 4),
        "milestone_verification_score": round(milestone_verification_score, 4),
        "resource_engagement_score": round(resource_engagement_score, 4),
    }


def _forge_execution_score(row):
    c = _forge_components(row)
    score = 0.0
    for key, weight in EXECUTION_SCORE_WEIGHTS.items():
        score += float(weight) * float(c.get(key, 0.0))
    return round(_forge_clamp(score) * 100.0, 2), c


def _forge_effective_agent_weights(row):
    mastery = row.get("agent_mastery", {})
    raw = {}
    for agent_key, agent_def in FORGE_AGENT_DEFAULTS.items():
        base = float(agent_def.get("weight", 0.1))
        m = max(0.1, float(mastery.get(agent_key, 1.0)))
        raw[agent_key] = base * m
    total = sum(raw.values()) or 1.0
    return {k: round(v / total, 4) for k, v in raw.items()}


def apply_forge_event(forge_state, normalize_actor_key, now_iso, actor_name, event_type, value=1.0, agent_key="execution_roadmap", metadata=None):
    ts = now_iso()
    row = _forge_actor_bucket(forge_state, normalize_actor_key, now_iso, actor_name)
    metrics = row.get("metrics", {})
    event_type = str(event_type or "").strip().lower()
    if not event_type:
        return {"error": "Missing event_type"}

    value = float(value)
    mapped_agent = _forge_map_agent(agent_key)
    if event_type in {"task_completed", "task_failed"}:
        metrics["tasks_total"] = int(metrics.get("tasks_total", 0)) + 1
        if event_type == "task_completed":
            metrics["tasks_completed"] = int(metrics.get("tasks_completed", 0)) + 1
            _forge_record_active_day(metrics, ts)
    elif event_type == "milestone_verified":
        metrics["milestones_total"] = int(metrics.get("milestones_total", 0)) + 1
        metrics["milestones_verified"] = int(metrics.get("milestones_verified", 0)) + 1
        _forge_record_active_day(metrics, ts)
    elif event_type == "milestone_added":
        metrics["milestones_total"] = int(metrics.get("milestones_total", 0)) + 1
    elif event_type == "resource_engaged":
        metrics["resource_engagements"] = int(metrics.get("resource_engagements", 0)) + 1
        _forge_record_active_day(metrics, ts)
    elif event_type == "confidence_check":
        val = _forge_clamp(value, 0.0, 100.0)
        if metrics.get("confidence_baseline") is None:
            metrics["confidence_baseline"] = round(val, 2)
        metrics["confidence_latest"] = round(val, 2)
        value = val
        _forge_record_active_day(metrics, ts)
    elif event_type == "mentor_redirect":
        row["discernment"]["mentor_redirects"] = int(row["discernment"].get("mentor_redirects", 0)) + 1
    elif event_type == "offline_validation_prompt":
        row["discernment"]["offline_validation_prompts"] = int(row["discernment"].get("offline_validation_prompts", 0)) + 1
    elif event_type == "dependency_limiter_prompt":
        row["discernment"]["dependency_limiter_prompts"] = int(row["discernment"].get("dependency_limiter_prompts", 0)) + 1

    reward_value = 0.0
    if event_type in {"thumb_up", "task_completed", "milestone_verified"}:
        reward_value = max(0.2, value)
    elif event_type in {"thumb_down", "task_failed"}:
        reward_value = -abs(value)
    elif event_type == "confidence_check":
        base = metrics.get("confidence_baseline")
        latest = metrics.get("confidence_latest")
        if base is not None and latest is not None:
            reward_value = (float(latest) - float(base)) / 20.0
            mapped_agent = "confidence_reinforcement"
    elif event_type in {"mentor_redirect", "offline_validation_prompt", "dependency_limiter_prompt"}:
        mapped_agent = "discernment"
        reward_value = 0.2

    current = float(row["agent_mastery"].get(mapped_agent, 1.0))
    updated = max(0.2, min(3.0, current + (float(reward_value) * 0.08)))
    row["agent_mastery"][mapped_agent] = round(updated, 4)

    event = {
        "id": str(uuid4()),
        "ts": ts,
        "event_type": event_type,
        "agent": mapped_agent,
        "value": round(float(value), 4),
        "reward": round(float(reward_value), 4),
        "metadata": metadata if isinstance(metadata, dict) else {},
    }
    row["events"].append(event)
    if len(row["events"]) > 500:
        row["events"] = row["events"][-500:]

    score, components = _forge_execution_score(row)
    row["score_history"].append({"ts": ts, "score": score})
    if len(row["score_history"]) > 500:
        row["score_history"] = row["score_history"][-500:]

    return {
        "event": event,
        "mastery": row["agent_mastery"][mapped_agent],
        "execution_score": score,
        "components": components,
        "effective_agent_weights": _forge_effective_agent_weights(row),
    }


def register_forge_routes(app, ctx):
    def _now():
        return ctx["now_iso"]()

    def _clamp(val, low=0.0, high=1.0):
        return max(low, min(high, float(val)))

    def _iso_to_dt(value):
        raw = str(value or "").strip()
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except Exception:
            return None

    def _actor_bucket(actor_name: str):
        key = ctx["normalize_actor_key"](actor_name)
        actors = ctx["forge_state"].setdefault("actors", {})
        if key not in actors or not isinstance(actors.get(key), dict):
            actors[key] = {
                "created_at": _now(),
                "updated_at": _now(),
                "metrics": {
                    "tasks_completed": 0,
                    "tasks_total": 0,
                    "milestones_verified": 0,
                    "milestones_total": 0,
                    "resource_engagements": 0,
                    "confidence_baseline": None,
                    "confidence_latest": None,
                    "active_days": [],
                },
                "agent_mastery": {k: 1.0 for k in FORGE_AGENT_DEFAULTS},
                "events": [],
                "score_history": [],
                "discernment": {
                    "mentor_redirects": 0,
                    "offline_validation_prompts": 0,
                    "dependency_limiter_prompts": 0,
                },
            }
        row = actors[key]
        row.setdefault("metrics", {})
        row.setdefault("agent_mastery", {})
        row.setdefault("events", [])
        row.setdefault("score_history", [])
        row.setdefault("discernment", {})
        for a in FORGE_AGENT_DEFAULTS:
            row["agent_mastery"][a] = float(row["agent_mastery"].get(a, 1.0) or 1.0)
        row["updated_at"] = _now()
        return row

    def _record_active_day(metrics, ts: str):
        dt = _iso_to_dt(ts) or datetime.now(timezone.utc)
        day_key = dt.astimezone(timezone.utc).strftime("%Y-%m-%d")
        active = metrics.setdefault("active_days", [])
        if day_key not in active:
            active.append(day_key)
            if len(active) > 120:
                del active[:-120]

    def _components(row):
        m = row.get("metrics", {})
        tasks_total = max(1, int(m.get("tasks_total", 0)))
        task_completion_rate = _clamp(float(m.get("tasks_completed", 0)) / tasks_total)

        active_days = m.get("active_days", []) if isinstance(m.get("active_days"), list) else []
        consistency_index = _clamp(float(len(active_days[-14:])) / 14.0)

        baseline = m.get("confidence_baseline")
        latest = m.get("confidence_latest")
        if baseline is None or latest is None:
            confidence_delta = 0.5
        else:
            delta = (float(latest) - float(baseline)) / 100.0
            confidence_delta = _clamp((delta + 1.0) / 2.0)

        milestones_total = max(1, int(m.get("milestones_total", 0)))
        milestone_verification_score = _clamp(float(m.get("milestones_verified", 0)) / milestones_total)

        resource_engagement_score = _clamp(float(m.get("resource_engagements", 0)) / 10.0)

        return {
            "task_completion_rate": round(task_completion_rate, 4),
            "consistency_index": round(consistency_index, 4),
            "confidence_delta": round(confidence_delta, 4),
            "milestone_verification_score": round(milestone_verification_score, 4),
            "resource_engagement_score": round(resource_engagement_score, 4),
        }

    def _execution_score(row):
        c = _components(row)
        score = 0.0
        for key, weight in EXECUTION_SCORE_WEIGHTS.items():
            score += float(weight) * float(c.get(key, 0.0))
        return round(_clamp(score) * 100.0, 2), c

    def _effective_agent_weights(row):
        mastery = row.get("agent_mastery", {})
        raw = {}
        for agent_key, agent_def in FORGE_AGENT_DEFAULTS.items():
            base = float(agent_def.get("weight", 0.1))
            m = max(0.1, float(mastery.get(agent_key, 1.0)))
            raw[agent_key] = base * m
        total = sum(raw.values()) or 1.0
        return {k: round(v / total, 4) for k, v in raw.items()}

    def _apply_reinforcement(row, agent_key: str, reward_value: float):
        key = str(agent_key or "execution_roadmap").strip().lower()
        if key not in FORGE_AGENT_DEFAULTS:
            key = "execution_roadmap"
        current = float(row["agent_mastery"].get(key, 1.0))
        updated = max(0.2, min(3.0, current + (float(reward_value) * 0.08)))
        row["agent_mastery"][key] = round(updated, 4)
        return key, row["agent_mastery"][key]

    def _impact_report(row, days: int = 30):
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=max(1, int(days)))
        created = _iso_to_dt(row.get("created_at")) or now
        events = row.get("events", []) if isinstance(row.get("events"), list) else []

        recent_events = []
        for ev in events:
            dt = _iso_to_dt(ev.get("ts"))
            if dt is not None and dt.astimezone(timezone.utc) >= cutoff:
                recent_events.append(ev)

        score_history = row.get("score_history", []) if isinstance(row.get("score_history"), list) else []
        recent_scores = []
        for point in score_history:
            dt = _iso_to_dt(point.get("ts"))
            if dt is not None and dt.astimezone(timezone.utc) >= cutoff:
                recent_scores.append(float(point.get("score", 0.0)))
        avg_score = round(sum(recent_scores) / len(recent_scores), 2) if recent_scores else 0.0

        first_action = None
        for ev in events:
            if ev.get("event_type") == "task_completed":
                dt = _iso_to_dt(ev.get("ts"))
                if dt is not None:
                    first_action = dt
                    break
        time_to_first_action_hours = None
        if first_action is not None:
            time_to_first_action_hours = round(
                max(0.0, (first_action.astimezone(timezone.utc) - created.astimezone(timezone.utc)).total_seconds() / 3600.0),
                2,
            )

        confidence_points = []
        for ev in recent_events:
            if ev.get("event_type") == "confidence_check":
                confidence_points.append(float(ev.get("value", 0.0)))
        confidence_delta_30d = 0.0
        if len(confidence_points) >= 2:
            confidence_delta_30d = round(confidence_points[-1] - confidence_points[0], 2)

        m = row.get("metrics", {})
        milestones_total = max(1, int(m.get("milestones_total", 0)))
        milestone_achievement_rate = round(float(m.get("milestones_verified", 0)) / milestones_total, 4)

        active_days = m.get("active_days", []) if isinstance(m.get("active_days"), list) else []
        active_recent = []
        for day in active_days:
            dt = _iso_to_dt(day + "T00:00:00+00:00")
            if dt is not None and dt >= cutoff:
                active_recent.append(day)
        retention_rate = round(len(set(active_recent)) / max(1, int(days)), 4)

        return {
            "window_days": int(days),
            "average_execution_score": avg_score,
            "time_to_first_action_hours": time_to_first_action_hours,
            "confidence_delta_30d": confidence_delta_30d,
            "milestone_achievement_rate": milestone_achievement_rate,
            "retention_rate": retention_rate,
            "events_observed": len(recent_events),
        }

    @app.get("/forge/agents")
    async def forge_agents(requester: Optional[str] = None, x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](requester, x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        row = _actor_bucket(acting_as)
        effective = _effective_agent_weights(row)
        items = []
        for key, cfg in FORGE_AGENT_DEFAULTS.items():
            items.append(
                {
                    "agent": key,
                    "name": cfg["name"],
                    "mastery": round(float(row["agent_mastery"].get(key, 1.0)), 4),
                    "weight": float(cfg["weight"]),
                    "effective_weight": float(effective.get(key, 0.0)),
                }
            )
        return {"requester": acting_as, "agents": items}

    @app.get("/forge/execution-score")
    async def forge_execution_score(requester: Optional[str] = None, x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](requester, x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        row = _actor_bucket(acting_as)
        score, components = _execution_score(row)
        return {"requester": acting_as, "execution_score": score, "components": components}

    @app.post("/forge/events")
    async def forge_events(data: dict = Body(...), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, auth_ctx = ctx["resolve_requester_with_auth"](data.get("requester"), x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        event_type = str(data.get("event_type", "")).strip().lower()
        if not event_type:
            return {"error": "Missing event_type"}
        result = apply_forge_event(
            ctx["forge_state"],
            ctx["normalize_actor_key"],
            ctx["now_iso"],
            acting_as,
            event_type=event_type,
            value=float(data.get("value", 1)),
            agent_key=str(data.get("agent", "execution_roadmap")).strip().lower(),
            metadata=(data.get("metadata", {}) if isinstance(data.get("metadata"), dict) else {}),
        )
        if result.get("error"):
            return {"error": result.get("error")}

        ctx["save_forge_state"]()
        ctx["audit_log"](
            "forge_event",
            acting_as,
            metadata={
                "event_type": event_type,
                "agent": result.get("event", {}).get("agent"),
                "reward": result.get("event", {}).get("reward"),
                "score": result.get("execution_score"),
            },
            tenant_id=(auth_ctx or {}).get("tenant_id", "default"),
        )

        return {
            "status": "ok",
            "requester": acting_as,
            **result,
        }

    @app.get("/forge/impact/report")
    async def forge_impact_report(requester: Optional[str] = None, days: int = 30, x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](requester, x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        row = _actor_bucket(acting_as)
        score, components = _execution_score(row)
        return {
            "requester": acting_as,
            "execution_score": score,
            "components": components,
            "discernment": row.get("discernment", {}),
            "impact": _impact_report(row, days=days),
        }

    @app.post("/forge/roadmap")
    async def forge_roadmap(data: dict = Body(...), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](data.get("requester"), x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        goal = str(data.get("goal", "")).strip()
        if not goal:
            return {"error": "Missing goal"}
        row = _actor_bucket(acting_as)
        weights = _effective_agent_weights(row)
        ordered_agents = sorted(weights.items(), key=lambda x: x[1], reverse=True)

        steps = [
            {"week": 1, "focus": "Idea validation interviews", "owner_agent": "idea_validation", "target": "Complete 10 user interviews"},
            {"week": 2, "focus": "Execution plan", "owner_agent": "execution_roadmap", "target": "Ship a 14-day milestone board"},
            {"week": 3, "focus": "Local resource mapping", "owner_agent": "local_resource", "target": "Engage 3 local programs/partners"},
            {"week": 4, "focus": "Confidence and review loop", "owner_agent": "confidence_reinforcement", "target": "Run weekly confidence check and milestone review"},
        ]
        for step in steps:
            step["agent_weight"] = float(weights.get(step["owner_agent"], 0.0))

        discernment_prompts = [
            "Validate high-risk assumptions with at least one human mentor before committing budget.",
            "If internet access is unstable, run interviews and scorecards offline, then sync events later.",
            "Do not outsource final founder decisions to AI; treat outputs as decision support only.",
        ]

        return {
            "requester": acting_as,
            "goal": goal,
            "top_agents": ordered_agents[:3],
            "roadmap": steps,
            "discernment_prompts": discernment_prompts,
        }

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

def _open_db(path: str):
    con = sqlite3.connect(path, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def _now():
    return datetime.now(timezone.utc).isoformat()


def _clamp(v, low=0.0, high=1.0):
    return max(low, min(high, float(v)))


def _ratio(n, d):
    den = max(1.0, float(d))
    return _clamp(float(n) / den)


def _init_db(path: str):
    con = _open_db(path)
    try:
        cur = con.cursor()
        cur.executescript(
            """
            create table if not exists utility_profiles (
                actor_key text primary key,
                actor_name text not null,
                role text not null default 'founder',
                main_goal text,
                market text,
                stage text,
                cohort text,
                created_at text not null,
                updated_at text not null
            );
            create table if not exists utility_goals (
                id text primary key,
                actor_key text not null,
                title text not null,
                target_days integer not null default 60,
                status text not null default 'active',
                created_at text not null,
                updated_at text not null
            );
            create table if not exists utility_milestones (
                id text primary key,
                goal_id text not null,
                actor_key text not null,
                title text not null,
                due_at text,
                status text not null default 'pending',
                verified integer not null default 0,
                created_at text not null,
                updated_at text not null
            );
            create table if not exists utility_tasks (
                id text primary key,
                goal_id text,
                milestone_id text,
                actor_key text not null,
                title text not null,
                status text not null default 'todo',
                due_at text,
                completed_at text,
                created_at text not null,
                updated_at text not null
            );
            create table if not exists utility_feedback (
                id text primary key,
                actor_key text not null,
                event_type text not null,
                value real not null default 1.0,
                agent_key text,
                metadata_json text not null default '{}',
                created_at text not null
            );
            create table if not exists utility_score_snapshots (
                id text primary key,
                actor_key text not null,
                week_start text not null,
                score real not null,
                components_json text not null default '{}',
                created_at text not null
            );
            create table if not exists utility_resources (
                id text primary key,
                region text not null,
                category text not null,
                name text not null,
                description text,
                url text,
                created_at text not null
            );
            """
        )
        c = cur.execute("select count(*) as c from utility_resources").fetchone()
        if int((c or {"c": 0})["c"]) == 0:
            ts = _now()
            seed = [
                ("ghana", "incubator", "MEST Africa", "Founder training and incubation.", "https://meltwater.org/mest/"),
                ("ghana", "community", "Ghana Tech Lab", "Digital entrepreneurship support.", "https://ghtechlab.com/"),
                ("west_africa", "community", "CcHub", "Innovation center and startup programs.", "https://cchub.africa/"),
                ("emerging_markets", "grant", "Google for Startups Africa", "Programs for African startups.", "https://startup.google.com/programs/"),
            ]
            for region, category, name, desc, url in seed:
                cur.execute(
                    "insert into utility_resources (id, region, category, name, description, url, created_at) values (?, ?, ?, ?, ?, ?, ?)",
                    (str(uuid4()), region, category, name, desc, url, ts),
                )
        con.commit()
    finally:
        con.close()


def _score(con, actor_key: str):
    cur = con.cursor()
    total = int((cur.execute("select count(*) as c from utility_tasks where actor_key = ?", (actor_key,)).fetchone() or {"c": 0})["c"])
    done = int((cur.execute("select count(*) as c from utility_tasks where actor_key = ? and status = 'done'", (actor_key,)).fetchone() or {"c": 0})["c"])
    task_completion_rate = _ratio(done, total)

    since = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    active_days = int(
        (
            cur.execute(
                "select count(distinct substr(coalesce(completed_at, updated_at, created_at),1,10)) as d from utility_tasks where actor_key = ? and coalesce(completed_at, updated_at, created_at) >= ?",
                (actor_key, since),
            ).fetchone()
            or {"d": 0}
        )["d"]
    )
    consistency_score = _clamp(active_days / 14.0)

    ms_total = int((cur.execute("select count(*) as c from utility_milestones where actor_key = ?", (actor_key,)).fetchone() or {"c": 0})["c"])
    ms_done = int((cur.execute("select count(*) as c from utility_milestones where actor_key = ? and verified = 1", (actor_key,)).fetchone() or {"c": 0})["c"])
    milestone_success_rate = _ratio(ms_done, ms_total)

    fb = cur.execute(
        "select sum(case when event_type in ('thumb_up','task_completed','milestone_verified') then value else 0 end) as pos, sum(case when event_type in ('thumb_down','task_failed') then abs(value) else 0 end) as neg from utility_feedback where actor_key = ?",
        (actor_key,),
    ).fetchone()
    if fb is None:
        pos = 0.0
        neg = 0.0
    else:
        pos = float(fb["pos"] or 0.0)
        neg = float(fb["neg"] or 0.0)
    feedback_score = _ratio(pos, pos + neg if (pos + neg) > 0 else 1.0)

    score = (0.4 * task_completion_rate) + (0.3 * consistency_score) + (0.2 * milestone_success_rate) + (0.1 * feedback_score)
    return round(_clamp(score) * 100.0, 2), {
        "task_completion_rate": round(task_completion_rate, 4),
        "consistency_score": round(consistency_score, 4),
        "milestone_success_rate": round(milestone_success_rate, 4),
        "feedback_score": round(feedback_score, 4),
    }


def register_utility_routes(app, ctx):
    db_path = str(ctx["UTILITY_DB_FILE"])
    _init_db(db_path)

    def _db():
        return _open_db(db_path)

    @app.get("/utility/onboarding")
    async def utility_get_onboarding(requester: Optional[str] = None, x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](requester, x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        k = ctx["normalize_actor_key"](acting_as)
        con = _db()
        try:
            row = con.execute("select * from utility_profiles where actor_key = ?", (k,)).fetchone()
            return {"requester": acting_as, "profile": dict(row) if row else None}
        finally:
            con.close()

    @app.post("/utility/onboarding")
    async def utility_save_onboarding(data: dict = Body(...), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, auth_ctx = ctx["resolve_requester_with_auth"](data.get("requester"), x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        k = ctx["normalize_actor_key"](acting_as)
        role = str(data.get("role", "founder")).strip().lower()
        if role not in {"founder", "main_user"}:
            role = "founder"
        ts = ctx["now_iso"]()
        con = _db()
        try:
            con.execute(
                """
                insert into utility_profiles (actor_key, actor_name, role, main_goal, market, stage, cohort, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(actor_key) do update set
                actor_name=excluded.actor_name, role=excluded.role, main_goal=excluded.main_goal, market=excluded.market, stage=excluded.stage, cohort=excluded.cohort, updated_at=excluded.updated_at
                """,
                (k, acting_as, role, str(data.get("main_goal", "")).strip(), str(data.get("market", "")).strip(), str(data.get("stage", "")).strip(), str(data.get("cohort", "")).strip(), ts, ts),
            )
            con.commit()
            row = con.execute("select * from utility_profiles where actor_key = ?", (k,)).fetchone()
            ctx["audit_log"]("utility_onboarding_save", acting_as, metadata={"role": role}, tenant_id=(auth_ctx or {}).get("tenant_id", "default"))
            return {"status": "ok", "profile": dict(row) if row else None}
        finally:
            con.close()

    @app.get("/utility/goals")
    async def utility_list_goals(requester: Optional[str] = None, x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](requester, x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        k = ctx["normalize_actor_key"](acting_as)
        con = _db()
        try:
            rows = con.execute("select * from utility_goals where actor_key = ? order by created_at desc", (k,)).fetchall()
            return {"requester": acting_as, "goals": [dict(r) for r in rows]}
        finally:
            con.close()

    @app.post("/utility/goals")
    async def utility_create_goal(data: dict = Body(...), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](data.get("requester"), x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        title = str(data.get("title", "")).strip()
        if not title:
            return {"error": "Missing title"}
        k = ctx["normalize_actor_key"](acting_as)
        ts = ctx["now_iso"]()
        gid = str(uuid4())
        target_days = max(7, min(365, int(data.get("target_days", 60) or 60)))
        con = _db()
        try:
            con.execute("insert into utility_goals (id, actor_key, title, target_days, status, created_at, updated_at) values (?, ?, ?, ?, 'active', ?, ?)", (gid, k, title, target_days, ts, ts))
            con.commit()
            row = con.execute("select * from utility_goals where id = ?", (gid,)).fetchone()
            return {"status": "ok", "goal": dict(row) if row else None}
        finally:
            con.close()

    @app.post("/utility/goals/{goal_id}/milestones/generate")
    async def utility_generate_milestones(goal_id: str, data: dict = Body({}), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](data.get("requester"), x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        k = ctx["normalize_actor_key"](acting_as)
        con = _db()
        try:
            goal = con.execute("select * from utility_goals where id = ? and actor_key = ?", (goal_id, k)).fetchone()
            if not goal:
                return {"error": "Goal not found"}
            existing = int((con.execute("select count(*) as c from utility_milestones where goal_id = ? and actor_key = ?", (goal_id, k)).fetchone() or {"c": 0})["c"])
            if existing == 0:
                ts = ctx["now_iso"]()
                td = int(goal["target_days"] or 60)
                now = datetime.now(timezone.utc)
                plan = [
                    ("Validate problem and users", int(td * 0.25)),
                    ("Build MVP and run first pilot", int(td * 0.5)),
                    ("Engage local resources and partners", int(td * 0.75)),
                    ("Launch and traction review", int(td)),
                ]
                for t, offset in plan:
                    due = (now + timedelta(days=max(1, offset))).date().isoformat()
                    con.execute("insert into utility_milestones (id, goal_id, actor_key, title, due_at, status, verified, created_at, updated_at) values (?, ?, ?, ?, ?, 'pending', 0, ?, ?)", (str(uuid4()), goal_id, k, t, due, ts, ts))
                con.commit()
            rows = con.execute("select * from utility_milestones where goal_id = ? and actor_key = ? order by due_at asc", (goal_id, k)).fetchall()
            return {"status": "ok", "milestones": [dict(r) for r in rows]}
        finally:
            con.close()

    @app.get("/utility/milestones")
    async def utility_list_milestones(requester: Optional[str] = None, goal_id: str = "", x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](requester, x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        k = ctx["normalize_actor_key"](acting_as)
        con = _db()
        try:
            if str(goal_id).strip():
                rows = con.execute("select * from utility_milestones where actor_key = ? and goal_id = ? order by due_at asc", (k, goal_id)).fetchall()
            else:
                rows = con.execute("select * from utility_milestones where actor_key = ? order by due_at asc", (k,)).fetchall()
            return {"requester": acting_as, "milestones": [dict(r) for r in rows]}
        finally:
            con.close()

    @app.patch("/utility/milestones/{milestone_id}")
    async def utility_patch_milestone(milestone_id: str, data: dict = Body(...), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](data.get("requester"), x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        k = ctx["normalize_actor_key"](acting_as)
        status = str(data.get("status", "")).strip().lower()
        verified = bool(data.get("verified", False))
        if status and status not in {"pending", "in_progress", "done", "blocked"}:
            return {"error": "Invalid status"}
        con = _db()
        try:
            row = con.execute("select * from utility_milestones where id = ? and actor_key = ?", (milestone_id, k)).fetchone()
            if not row:
                return {"error": "Milestone not found"}
            ts = ctx["now_iso"]()
            new_status = status or str(row["status"])
            new_verified = 1 if (verified or new_status == "done") else int(row["verified"] or 0)
            con.execute("update utility_milestones set status = ?, verified = ?, updated_at = ? where id = ?", (new_status, new_verified, ts, milestone_id))
            if new_verified:
                con.execute("insert into utility_feedback (id, actor_key, event_type, value, agent_key, metadata_json, created_at) values (?, ?, 'milestone_verified', 1.0, 'execution_roadmap', ?, ?)", (str(uuid4()), k, json.dumps({"milestone_id": milestone_id}), ts))
                fr = ctx["apply_forge_event"](ctx["forge_state"], ctx["normalize_actor_key"], ctx["now_iso"], acting_as, event_type="milestone_verified", value=1.0, agent_key="execution_roadmap", metadata={"source": "utility"})
                if not fr.get("error"):
                    ctx["save_forge_state"]()
            con.commit()
            out = con.execute("select * from utility_milestones where id = ?", (milestone_id,)).fetchone()
            return {"status": "ok", "milestone": dict(out) if out else None}
        finally:
            con.close()

    @app.get("/utility/tasks")
    async def utility_list_tasks(requester: Optional[str] = None, goal_id: str = "", status: str = "", x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](requester, x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        k = ctx["normalize_actor_key"](acting_as)
        con = _db()
        try:
            q = "select * from utility_tasks where actor_key = ?"
            p = [k]
            if str(goal_id).strip():
                q += " and goal_id = ?"
                p.append(goal_id)
            if str(status).strip():
                q += " and status = ?"
                p.append(str(status).strip().lower())
            q += " order by coalesce(due_at, created_at) asc"
            rows = con.execute(q, tuple(p)).fetchall()
            return {"requester": acting_as, "tasks": [dict(r) for r in rows]}
        finally:
            con.close()

    @app.post("/utility/tasks")
    async def utility_create_task(data: dict = Body(...), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](data.get("requester"), x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        title = str(data.get("title", "")).strip()
        if not title:
            return {"error": "Missing title"}
        k = ctx["normalize_actor_key"](acting_as)
        ts = ctx["now_iso"]()
        tid = str(uuid4())
        goal_id = str(data.get("goal_id", "")).strip() or None
        milestone_id = str(data.get("milestone_id", "")).strip() or None
        due_at = str(data.get("due_at", "")).strip() or None
        con = _db()
        try:
            con.execute("insert into utility_tasks (id, goal_id, milestone_id, actor_key, title, status, due_at, completed_at, created_at, updated_at) values (?, ?, ?, ?, ?, 'todo', ?, null, ?, ?)", (tid, goal_id, milestone_id, k, title, due_at, ts, ts))
            con.commit()
            row = con.execute("select * from utility_tasks where id = ?", (tid,)).fetchone()
            return {"status": "ok", "task": dict(row) if row else None}
        finally:
            con.close()

    @app.post("/utility/tasks/{task_id}/complete")
    async def utility_complete_task(task_id: str, data: dict = Body({}), x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](data.get("requester"), x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        k = ctx["normalize_actor_key"](acting_as)
        ts = ctx["now_iso"]()
        con = _db()
        try:
            row = con.execute("select * from utility_tasks where id = ? and actor_key = ?", (task_id, k)).fetchone()
            if not row:
                return {"error": "Task not found"}
            con.execute("update utility_tasks set status = 'done', completed_at = ?, updated_at = ? where id = ?", (ts, ts, task_id))
            con.execute("insert into utility_feedback (id, actor_key, event_type, value, agent_key, metadata_json, created_at) values (?, ?, 'task_completed', 1.0, 'execution_roadmap', ?, ?)", (str(uuid4()), k, json.dumps({"task_id": task_id}), ts))
            con.commit()
            fr = ctx["apply_forge_event"](ctx["forge_state"], ctx["normalize_actor_key"], ctx["now_iso"], acting_as, event_type="task_completed", value=1.0, agent_key="execution_roadmap", metadata={"source": "utility"})
            if not fr.get("error"):
                ctx["save_forge_state"]()
            row2 = con.execute("select * from utility_tasks where id = ?", (task_id,)).fetchone()
            return {"status": "ok", "task": dict(row2) if row2 else None}
        finally:
            con.close()

    @app.get("/utility/scores/current")
    async def utility_score_current(requester: Optional[str] = None, x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](requester, x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        k = ctx["normalize_actor_key"](acting_as)
        con = _db()
        try:
            score, components = _score(con, k)
            return {"requester": acting_as, "execution_score": score, "components": components}
        finally:
            con.close()

    @app.get("/utility/dashboard")
    async def utility_dashboard(requester: Optional[str] = None, x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](requester, x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        k = ctx["normalize_actor_key"](acting_as)
        con = _db()
        try:
            profile = con.execute("select * from utility_profiles where actor_key = ?", (k,)).fetchone()
            goals = con.execute("select * from utility_goals where actor_key = ? order by created_at desc limit 5", (k,)).fetchall()
            milestones = con.execute("select * from utility_milestones where actor_key = ? order by due_at asc limit 8", (k,)).fetchall()
            tasks = con.execute("select * from utility_tasks where actor_key = ? order by coalesce(due_at, created_at) asc limit 12", (k,)).fetchall()
            score, components = _score(con, k)
            snaps = con.execute("select week_start, score, components_json from utility_score_snapshots where actor_key = ? order by created_at desc limit 8", (k,)).fetchall()
            trend = "stable"
            if len(snaps) >= 2:
                a = float(snaps[0]["score"] or 0.0)
                b = float(snaps[1]["score"] or 0.0)
                if a > b + 1.5:
                    trend = "up"
                elif a < b - 1.5:
                    trend = "down"
            suggestions = []
            if float(components.get("task_completion_rate", 0.0)) < 0.45:
                suggestions.append("Complete 3 priority tasks this week before adding new ones.")
            if float(components.get("consistency_score", 0.0)) < 0.4:
                suggestions.append("Block a fixed daily execution window to increase consistency.")
            if float(components.get("milestone_success_rate", 0.0)) < 0.35:
                suggestions.append("Break milestones into smaller verifiable deliverables.")
            if trend == "down":
                suggestions.append("Your trend is down. Review blockers and adjust scope this week.")
            if not suggestions:
                suggestions.append("Trend is healthy. Push one local market action this week.")
            return {
                "requester": acting_as,
                "profile": dict(profile) if profile else None,
                "execution_score": score,
                "components": components,
                "trend": trend,
                "goals": [dict(r) for r in goals],
                "milestones": [dict(r) for r in milestones],
                "tasks": [dict(r) for r in tasks],
                "score_history": [dict(r) for r in snaps],
                "suggestions": suggestions,
            }
        finally:
            con.close()

    @app.get("/utility/resources/recommendations")
    async def utility_resources(requester: Optional[str] = None, region: str = "", limit: int = 8, x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](requester, x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        k = ctx["normalize_actor_key"](acting_as)
        con = _db()
        try:
            prof = con.execute("select * from utility_profiles where actor_key = ?", (k,)).fetchone()
            guessed = str(region or "").strip().lower()
            if not guessed and prof:
                market = str(prof["market"] or "").lower()
                if "ghana" in market:
                    guessed = "ghana"
                elif "west" in market:
                    guessed = "west_africa"
            if not guessed:
                guessed = "ghana"
            rows = con.execute("select * from utility_resources where region in (?, 'emerging_markets') order by case when region = ? then 0 else 1 end limit ?", (guessed, guessed, max(1, min(20, int(limit))))).fetchall()
            return {"requester": acting_as, "region": guessed, "resources": [dict(r) for r in rows]}
        finally:
            con.close()

    @app.get("/utility/cohort/overview")
    async def utility_cohort_overview(requester: Optional[str] = None, cohort: str = "", x_auth_token: Optional[str] = Header(default=None, alias="X-Auth-Token")):
        acting_as, auth_err, _ = ctx["resolve_requester_with_auth"](requester, x_auth_token, allow_admin_impersonate=True)
        if auth_err:
            return {"error": auth_err}
        k = ctx["normalize_actor_key"](acting_as)
        con = _db()
        try:
            me = con.execute("select * from utility_profiles where actor_key = ?", (k,)).fetchone()
            if not me or str(me["role"] or "founder") != "main_user":
                return {"error": "Role restricted: main_user required"}
            cohort_name = str(cohort or me["cohort"] or "").strip()
            if not cohort_name:
                return {"error": "Missing cohort"}
            rows = con.execute("select actor_key, actor_name from utility_profiles where cohort = ? and role = 'founder' order by actor_name asc", (cohort_name,)).fetchall()
            members = []
            for r in rows:
                score, comp = _score(con, str(r["actor_key"]))
                members.append({"actor_key": r["actor_key"], "actor_name": r["actor_name"], "execution_score": score, "task_completion_rate": comp["task_completion_rate"], "consistency_score": comp["consistency_score"]})
            avg = round(sum(float(x["execution_score"]) for x in members) / max(1, len(members)), 2)
            return {"cohort": cohort_name, "member_count": len(members), "average_execution_score": avg, "members": members}
        finally:
            con.close()



