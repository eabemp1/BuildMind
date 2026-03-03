from fastapi.testclient import TestClient

import main
from app import legacy
from app.agent.chat_helpers import personalize_fact_for_actor


def test_stale_reminder_context_is_sanitized_when_no_live_reminders():
    history = "User: start open-weight plan tomorrow\nAI: okay, scheduled"
    cleaned = main._sanitize_prompt_context_for_stale_plans(history, "")
    assert "open-weight" not in cleaned.lower()
    assert "tomorrow" not in cleaned.lower()


def test_creator_and_owner_deterministic_intents():
    creator_intent = main.parse_deterministic_intent("Who is the creator?")
    owner_intent = main.parse_deterministic_intent("Who owns the AI?")
    assert creator_intent and creator_intent.get("type") == "creator_info"
    assert owner_intent and owner_intent.get("type") == "ownership_info"
    assert "Emmanuel Bempong" in main.deterministic_response(creator_intent, "tester")
    assert "owns" in main.deterministic_response(owner_intent, "tester").lower()


def test_weighted_correction_delta_scales_with_severity():
    mild = legacy._weighted_accuracy_delta_from_verdict("assistant_incorrect", confidence=0.4, severity=1)
    severe = legacy._weighted_accuracy_delta_from_verdict("assistant_incorrect", confidence=0.4, severity=5)
    correct = legacy._weighted_accuracy_delta_from_verdict("assistant_correct", confidence=0.8, severity=5)
    assert severe < mild
    assert correct > 0


def test_coding_ask_repairs_to_code_block(monkeypatch):
    replies = iter([
        "Here is the explanation only.",
        "```python\nprint('ok')\n```",
    ])
    legacy.reminders = []
    monkeypatch.setattr(legacy, "save_reminders", lambda: None)
    monkeypatch.setattr(legacy, "save_agents", lambda: None)
    monkeypatch.setattr(legacy, "save_chain_state", lambda: None)
    monkeypatch.setattr(legacy, "save_usage_log", lambda: None)
    monkeypatch.setattr(legacy, "save_global_core", lambda: None)
    monkeypatch.setattr(legacy, "strict_access_block", lambda specialty, requester_name: None)
    monkeypatch.setattr(legacy, "rental_lock_for_requester", lambda specialty, requester_name: None)
    monkeypatch.setattr(legacy, "ask_llm_with_model", lambda prompt, model: next(replies))

    client = TestClient(legacy.app)
    resp = client.get("/ask", params={"q": "Write python code to print ok", "requester": "tester", "ctx": ""})
    assert resp.status_code == 200
    assert "ai-code-wrap" in resp.text


def test_personalize_fact_uses_actor_name():
    out = personalize_fact_for_actor("User wants to add more features to banking system", "Emmanuel")
    assert out.startswith("Emmanuel wants to")
