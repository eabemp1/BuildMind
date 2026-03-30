from pathlib import Path

from fastapi.testclient import TestClient

import main


def test_detect_category_finance():
    category, specialty, _ = main.detect_category_and_specialty("crypto market and bullish bitcoin momentum")
    assert category == "finance"
    assert specialty == "finance"


def test_parse_reminder_command():
    parsed = main.parse_reminder_command("remind me to call team at 11am")
    assert parsed is not None
    assert parsed["task_text"].lower().startswith("call")
    assert parsed["due_at"] is not None


def test_privacy_toggle_actor():
    actor = "test_actor_privacy"
    main.set_sharing_enabled_for_actor(actor, False)
    assert main.sharing_enabled_for_actor(actor) is False
    main.set_sharing_enabled_for_actor(actor, True)
    assert main.sharing_enabled_for_actor(actor) is True


def test_emit_global_event_respects_privacy(tmp_path, monkeypatch):
    events_file = tmp_path / "events.jsonl"
    monkeypatch.setattr(main, "GLOBAL_EVENTS_FILE", events_file)
    main.set_sharing_enabled_for_actor("anon_off", False)
    emitted = main.emit_global_event("interaction", "anon_off", "personal", {"channel": "ask"})
    assert emitted is False
    assert not events_file.exists()

    main.set_sharing_enabled_for_actor("anon_on", True)
    emitted = main.emit_global_event("interaction", "anon_on", "personal", {"channel": "ask"})
    assert emitted is True
    assert events_file.exists()
    lines = events_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    assert "actor_hash" in lines[0]


def test_ask_endpoint_reminder_flow(monkeypatch):
    main.reminders = []
    monkeypatch.setattr(main, "save_reminders", lambda: None)
    monkeypatch.setattr(main, "save_agents", lambda: None)
    monkeypatch.setattr(main, "save_chain_state", lambda: None)
    monkeypatch.setattr(main, "save_usage_log", lambda: None)
    monkeypatch.setattr(main, "save_global_core", lambda: None)
    monkeypatch.setattr(main, "ask_llm", lambda prompt: "Sure, reminder set.")
    monkeypatch.setattr(main, "strict_access_block", lambda specialty, requester_name: None)
    monkeypatch.setattr(main, "rental_lock_for_requester", lambda specialty, requester_name: None)

    client = TestClient(main.app)
    resp = client.get("/ask", params={"q": "Remind me to call someone at 11am", "requester": "tester"})
    assert resp.status_code == 200
    assert "Saved reminder" in resp.text
    assert len(main.reminders) == 1
