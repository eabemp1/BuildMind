from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import Body, Header


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


