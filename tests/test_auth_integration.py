"""Integration tests for the JWT auth system.

These tests verify that:
- Registration creates a user in the DB (not flat files)
- Login returns a proper JWT
- Protected endpoints reject requests without a token
- Protected endpoints accept valid JWTs
- The flat-file agent auth at /agent/* does NOT interfere with /api/v1/* auth
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models import User

TEST_DB_URL = "sqlite:///./test_auth.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


def _register(client, email="founder@test.com", password="secure123", username="founder"):
    return client.post("/api/v1/register", json={
        "email": email,
        "password": password,
        "username": username,
    })


def _login(client, email="founder@test.com", password="secure123"):
    return client.post("/api/v1/login", json={"email": email, "password": password})


class TestRegistration:
    def test_register_returns_201(self, client):
        r = _register(client)
        assert r.status_code == 201
        assert r.json()["success"] is True

    def test_register_stores_user_in_db(self, client):
        _register(client)
        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "founder@test.com").first()
        db.close()
        assert user is not None
        assert user.username == "founder"

    def test_register_duplicate_email_fails(self, client):
        _register(client)
        r = _register(client)
        assert r.status_code == 400

    def test_register_no_plaintext_password_stored(self, client):
        _register(client)
        db = TestingSessionLocal()
        user = db.query(User).filter(User.email == "founder@test.com").first()
        db.close()
        assert user.hashed_password != "secure123"
        assert len(user.hashed_password) > 20


class TestLogin:
    def test_login_returns_jwt(self, client):
        _register(client)
        r = _login(client)
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert "access_token" in data["data"]
        assert data["data"]["token_type"] == "bearer"

    def test_login_wrong_password_rejected(self, client):
        _register(client)
        r = _login(client, password="wrongpassword")
        assert r.status_code == 401

    def test_login_unknown_email_rejected(self, client):
        r = _login(client, email="nobody@test.com")
        assert r.status_code == 401


class TestProtectedEndpoints:
    def test_projects_requires_auth(self, client):
        r = client.get("/api/v1/projects")
        assert r.status_code == 401

    def test_dashboard_requires_auth(self, client):
        r = client.get("/api/v1/dashboard")
        assert r.status_code == 401

    def test_valid_jwt_grants_access_to_projects(self, client):
        _register(client)
        token = _login(client).json()["data"]["access_token"]
        r = client.get("/api/v1/projects", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200

    def test_invalid_jwt_rejected(self, client):
        r = client.get("/api/v1/projects", headers={"Authorization": "Bearer notavalidtoken"})
        assert r.status_code == 401

    def test_tampered_jwt_rejected(self, client):
        _register(client)
        token = _login(client).json()["data"]["access_token"]
        tampered = token[:-5] + "XXXXX"
        r = client.get("/api/v1/projects", headers={"Authorization": f"Bearer {tampered}"})
        assert r.status_code == 401


class TestAuthSystemIsolation:
    """Verify the agent flat-file auth doesn't bleed into the platform auth."""

    def test_platform_auth_rejects_x_auth_token_header(self, client):
        """X-Auth-Token is the agent's auth header. Platform endpoints must ignore it."""
        _register(client)
        r = client.get("/api/v1/projects", headers={"X-Auth-Token": "some-uuid-token"})
        # Must be 401, not 200 — platform uses Bearer JWT only
        assert r.status_code == 401

    def test_health_endpoint_unauthenticated(self, client):
        r = client.get("/api/v1/health")
        assert r.status_code == 200
        assert r.json()["success"] is True
