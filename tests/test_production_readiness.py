from fastapi.testclient import TestClient

from app.main import app


def test_root_health_contract():
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "evolvai-backend"}


def test_versioned_health_exists():
    client = TestClient(app)
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json().get("success") is True
