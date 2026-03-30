import json
from uuid import uuid4

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import Project


def _auth_headers(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_agent_generate_roadmap_creates_project_and_tasks():
    client = TestClient(app)
    email = f"agent_{uuid4().hex[:10]}@example.com"
    password = "StrongPass123"

    reg = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201
    user_id = int(reg.json()["data"]["id"])

    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    token = login.json()["data"]["access_token"]

    response = client.post(
        "/api/v1/agent/generate-roadmap",
        headers=_auth_headers(token),
        json={
            "idea_description": "A B2B platform that helps retail stores track inventory and demand patterns.",
            "country": "Ghana",
            "industry": "Retail Tech",
            "stage": "Idea",
        },
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert len(body["roadmap"]) == 3
    assert [s["stage"] for s in body["roadmap"]] == ["Validation", "MVP", "Growth"]
    assert all(len(s["tasks"]) >= 3 for s in body["roadmap"])

    projects = client.get("/api/v1/projects", headers=_auth_headers(token))
    assert projects.status_code == 200
    items = projects.json()["data"]
    assert len(items) >= 1
    created = items[0]
    assert len(created["milestones"]) == 3
    assert sum(len(ms["tasks"]) for ms in created["milestones"]) >= 9

    db = SessionLocal()
    try:
        row = db.query(Project).filter(Project.id == created["id"], Project.user_id == user_id).first()
        assert row is not None
        assert isinstance(row.roadmap_json, str) and row.roadmap_json.strip()
        parsed = json.loads(row.roadmap_json)
        assert isinstance(parsed, list) and len(parsed) == 3
    finally:
        db.close()
