from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _auth_headers(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_execution_score_analytics_endpoint_contract():
    client = TestClient(app)
    email = f"score_{uuid4().hex[:10]}@example.com"
    password = "StrongPass123"

    reg = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    token = login.json()["data"]["access_token"]

    project = client.post(
        "/api/v1/projects",
        headers=_auth_headers(token),
        json={"title": "Execution score analytics", "description": "test"},
    )
    assert project.status_code == 201
    pid = project.json()["data"]["id"]

    gen = client.post(
        f"/api/v1/projects/{pid}/generate-roadmap",
        headers=_auth_headers(token),
        json={"goal_duration_weeks": 4},
    )
    assert gen.status_code == 200
    task_id = gen.json()["data"]["milestones"][0]["tasks"][0]["id"]
    done = client.post(f"/api/v1/tasks/{task_id}/complete", headers=_auth_headers(token))
    assert done.status_code == 200

    res = client.get("/api/v1/analytics/execution-score", headers=_auth_headers(token))
    assert res.status_code == 200
    body = res.json()
    assert "score" in body
    assert "completion_rate" in body
    assert "weekly_consistency" in body
    assert "velocity" in body
    assert "chart_data" in body
    assert "execution_score_trend" in body["chart_data"]
    assert "weekly_task_completion" in body["chart_data"]
    assert "milestone_progress" in body["chart_data"]
