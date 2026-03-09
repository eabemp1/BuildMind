from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _auth_headers(token: str):
    return {"Authorization": f"Bearer {token}"}


def _register_and_login(client: TestClient):
    email = f"op_{uuid4().hex[:10]}@example.com"
    password = "StrongPass123"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert reg.status_code == 201
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    return login.json()["data"]["access_token"]


def test_opportunities_recommended_returns_matches():
    client = TestClient(app)
    token = _register_and_login(client)
    res = client.get("/api/v1/opportunities/recommended", headers=_auth_headers(token))
    assert res.status_code == 200
    body = res.json()["data"]
    assert "matches" in body
    assert isinstance(body["matches"], list)
    assert len(body["matches"]) > 0


def test_opportunities_uses_profile_from_roadmap_generation():
    client = TestClient(app)
    token = _register_and_login(client)

    roadmap = client.post(
        "/api/v1/agent/generate-roadmap",
        headers=_auth_headers(token),
        json={
            "idea_description": "A digital platform for small Ghana retail shops",
            "country": "Ghana",
            "industry": "Retail Tech",
            "stage": "MVP",
        },
    )
    assert roadmap.status_code == 200

    res = client.get("/api/v1/opportunities/recommended?limit=3", headers=_auth_headers(token))
    assert res.status_code == 200
    payload = res.json()["data"]
    profile = payload["profile"]
    assert profile["country"] == "Ghana"
    assert profile["startup_stage"] == "MVP"
    assert profile["industry"] == "Retail Tech"
    assert len(payload["matches"]) >= 1
    # Ghana-focused opportunities should rank near the top.
    top_regions = [str(item.get("region", "")).lower() for item in payload["matches"]]
    assert any("ghana" in r for r in top_regions)
