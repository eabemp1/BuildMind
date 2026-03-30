from pathlib import Path

from fastapi.testclient import TestClient

import main


def test_deterministic_capabilities_intent():
    intent = main.parse_deterministic_intent("What are your capabilities?")
    assert intent is not None
    text = main.deterministic_response(intent, "tester")
    assert "help" in text.lower()


def test_auth_register_login_logout_flow(monkeypatch):
    main.users_state = {"users": []}
    main.auth_sessions_state = {"sessions": {}}
    monkeypatch.setattr(main, "save_users", lambda: None)
    monkeypatch.setattr(main, "save_auth_sessions", lambda: None)

    client = TestClient(main.app)
    reg = client.post("/auth/register", json={"username": "alice", "password": "secret12", "tenant_id": "t1"})
    assert reg.status_code == 200
    assert reg.json().get("status") == "ok"

    login = client.post("/auth/login", json={"username": "alice", "password": "secret12"})
    assert login.status_code == 200
    token = login.json().get("token")
    assert token

    me = client.get("/auth/me", headers={"X-Auth-Token": token})
    assert me.status_code == 200
    assert me.json().get("authenticated") is True

    out = client.post("/auth/logout", headers={"X-Auth-Token": token})
    assert out.status_code == 200
    assert out.json().get("status") == "ok"


def test_memory_items_crud(monkeypatch):
    main.memory_items_state = {"actors": {}}
    monkeypatch.setattr(main, "save_memory_items", lambda: None)

    client = TestClient(main.app)
    add = client.post("/memory/items", json={"requester": "tester", "text": "Prefers concise responses", "scope": "personal"})
    assert add.status_code == 200
    item = add.json().get("item")
    assert item and item.get("id")

    lst = client.get("/memory/items", params={"requester": "tester"})
    assert lst.status_code == 200
    assert len(lst.json().get("items", [])) == 1

    mid = item["id"]
    upd = client.patch(f"/memory/items/{mid}", json={"requester": "tester", "text": "Prefers concise bullet responses"})
    assert upd.status_code == 200
    assert "bullet" in upd.json()["item"]["text"]

    dele = client.delete(f"/memory/items/{mid}", params={"requester": "tester"})
    assert dele.status_code == 200
    assert dele.json().get("status") == "ok"


def test_history_semantic_search_function():
    main.chat_history = [
        {
            "id": "abc123",
            "requester": "tester",
            "title": "Crypto Session",
            "messages": [
                {"ts": "2026-02-12T10:00:00Z", "label": "You", "content_text": "bitcoin momentum and market risk"},
                {"ts": "2026-02-12T10:01:00Z", "label": "Lumiere", "content_text": "discussed risk management"},
            ],
            "created_at": "2026-02-12T10:00:00Z",
            "updated_at": "2026-02-12T10:02:00Z",
        }
    ]
    hits = main.semantic_history_search("tester", "bitcoin market", limit=5)
    assert hits
    assert hits[0]["session_id"] == "abc123"


def test_checkpoint_create_and_regression(monkeypatch, tmp_path: Path):
    dataset_file = tmp_path / "lumiere_dataset_test.json"
    dataset_file.write_text('{"event_count": 10, "ratings": {"up": 3, "down": 1}}', encoding="utf-8")

    main.checkpoints_state = {"checkpoints": [], "active_checkpoint_id": None}
    monkeypatch.setattr(main, "save_checkpoints", lambda: None)
    monkeypatch.setattr(main, "CHECKPOINT_DIR", tmp_path)

    client = TestClient(main.app)
    cp = client.post("/checkpoints/create", json={"requester": "tester", "dataset_path": str(dataset_file), "notes": "test cp"})
    assert cp.status_code == 200
    assert cp.json().get("status") == "ok"

    reg = client.get("/quality/regression/run")
    assert reg.status_code == 200
    body = reg.json()
    assert "passed" in body
    assert body.get("total", 0) >= 1
