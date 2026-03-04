import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from app.agent.reminder_scheduler import collect_due_daily_preferences
from app.main import app


def _auth_headers(token: str):
    return {"Authorization": f"Bearer {token}"}


def _register_and_login(client: TestClient):
    email = f"user_{uuid4().hex[:10]}@example.com"
    password = "StrongPass123"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    token = login.json()["data"]["access_token"]
    return token


def test_weekly_report_endpoint_flow():
    client = TestClient(app)
    token = _register_and_login(client)

    proj = client.post(
        "/api/v1/projects",
        json={"title": "Launch MVP in 60 days", "description": "Founder execution project"},
        headers=_auth_headers(token),
    )
    assert proj.status_code == 201
    project_id = proj.json()["data"]["id"]

    gen = client.post(
        f"/api/v1/projects/{project_id}/generate-roadmap",
        json={"goal_duration_weeks": 4},
        headers=_auth_headers(token),
    )
    assert gen.status_code == 200
    first_task_id = gen.json()["data"]["milestones"][0]["tasks"][0]["id"]

    done = client.post(f"/api/v1/tasks/{first_task_id}/complete", headers=_auth_headers(token))
    assert done.status_code == 200

    fb = client.post(
        "/api/v1/feedback",
        json={"task_id": first_task_id, "feedback_type": "positive"},
        headers=_auth_headers(token),
    )
    assert fb.status_code == 201

    report = client.get("/api/v1/report/weekly", headers=_auth_headers(token))
    assert report.status_code == 200
    payload = report.json()["data"]
    assert len(payload["execution_score_trend"]) == 7
    assert len(payload["weekly_task_completion"]) == 7
    assert len(payload["milestone_achievement"]) == 7
    assert "tasks_completed_this_week" in payload
    assert payload["feedback"]["positive"] >= 1


def test_reminder_preference_endpoint_and_scheduler_pickup(tmp_path: Path):
    client = TestClient(app)
    token = _register_and_login(client)

    save = client.post(
        "/api/v1/reminder/preferences",
        json={"reminder_time": "09:30", "enabled": True},
        headers=_auth_headers(token),
    )
    assert save.status_code == 200
    assert save.json()["data"]["reminder_time"] == "09:30"

    get = client.get("/api/v1/reminder/preferences", headers=_auth_headers(token))
    assert get.status_code == 200
    assert get.json()["data"]["enabled"] is True

    db_file = tmp_path / "sched_test.db"
    con = sqlite3.connect(str(db_file))
    cur = con.cursor()
    cur.execute(
        "create table users (id integer primary key, email text not null)"
    )
    cur.execute(
        "create table reminder_preferences (id integer primary key, user_id integer unique not null, reminder_time text not null, enabled integer not null, updated_at text not null, last_triggered_at text)"
    )
    cur.execute("insert into users (id, email) values (1, 'founder@example.com')")
    cur.execute(
        "insert into reminder_preferences (id, user_id, reminder_time, enabled, updated_at, last_triggered_at) values (1, 1, '09:30', 1, ?, null)",
        (datetime.now(timezone.utc).isoformat(),),
    )
    con.commit()
    con.close()

    due = collect_due_daily_preferences(
        f"sqlite:///{db_file}",
        now_utc=datetime.now(timezone.utc).replace(hour=9, minute=30, second=0, microsecond=0),
    )
    assert len(due) == 1
    assert due[0]["email"] == "founder@example.com"

    # Same day, same minute should not trigger again due to last_triggered_at guard.
    due_again = collect_due_daily_preferences(
        f"sqlite:///{db_file}",
        now_utc=datetime.now(timezone.utc).replace(hour=9, minute=30, second=30, microsecond=0),
    )
    assert due_again == []
