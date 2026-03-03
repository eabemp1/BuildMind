from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _auth_headers(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_execution_v1_end_to_end():
    client = TestClient(app)
    email = f"user_{uuid4().hex[:10]}@example.com"
    password = "StrongPass123"

    reg = client.post("/register", json={"email": email, "password": password})
    assert reg.status_code == 201
    uid = reg.json()["id"]
    assert uid > 0

    login = client.post("/login", json={"email": email, "password": password})
    assert login.status_code == 200
    token = login.json()["access_token"]
    assert token

    proj = client.post(
        "/projects",
        json={"title": "Launch MVP in 60 days", "description": "Founder execution project"},
        headers=_auth_headers(token),
    )
    assert proj.status_code == 201
    project_id = proj.json()["id"]

    gen = client.post(
        f"/projects/{project_id}/generate-roadmap",
        json={"goal_duration_weeks": 4},
        headers=_auth_headers(token),
    )
    assert gen.status_code == 200
    milestones = gen.json()["milestones"]
    assert len(milestones) == 4
    assert all(len(ms["tasks"]) >= 3 for ms in milestones)

    fetch = client.get(f"/projects/{project_id}", headers=_auth_headers(token))
    assert fetch.status_code == 200
    first_task = fetch.json()["milestones"][0]["tasks"][0]
    task_id = first_task["id"]

    done = client.post(f"/tasks/{task_id}/complete", headers=_auth_headers(token))
    assert done.status_code == 200
    assert done.json()["is_completed"] is True

    fb = client.post(
        "/feedback",
        json={"task_id": task_id, "feedback_type": "positive"},
        headers=_auth_headers(token),
    )
    assert fb.status_code == 201
    assert fb.json()["feedback_type"] == "positive"

    dash = client.get("/dashboard", headers=_auth_headers(token))
    assert dash.status_code == 200
    body = dash.json()
    assert body["execution_score"] >= 0
    assert "score_history" in body

