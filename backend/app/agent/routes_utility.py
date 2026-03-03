import json
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import Body, Header


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

