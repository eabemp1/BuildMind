from fastapi.testclient import TestClient
from uuid import uuid4

import main


def test_forge_execution_score_updates():
    requester = f"forge_tester_{uuid4().hex[:8]}"
    client = TestClient(main.app)
    evt = client.post(
        "/forge/events",
        json={"requester": requester, "event_type": "task_completed", "agent": "execution_roadmap"},
    )
    assert evt.status_code == 200
    body = evt.json()
    assert body.get("status") == "ok"
    assert body.get("execution_score", 0) > 0

    conf = client.post(
        "/forge/events",
        json={"requester": requester, "event_type": "confidence_check", "value": 72},
    )
    assert conf.status_code == 200

    score = client.get("/forge/execution-score", params={"requester": requester})
    assert score.status_code == 200
    score_body = score.json()
    assert "components" in score_body
    assert "task_completion_rate" in score_body["components"]


def test_forge_agent_mastery_and_report():
    requester = f"forge_tester_{uuid4().hex[:8]}"
    client = TestClient(main.app)
    before = client.get("/forge/agents", params={"requester": requester})
    assert before.status_code == 200
    before_row = next(x for x in before.json()["agents"] if x["agent"] == "local_resource")

    up = client.post(
        "/forge/events",
        json={"requester": requester, "event_type": "thumb_up", "agent": "local_resource", "value": 1},
    )
    assert up.status_code == 200
    assert up.json().get("mastery", 0) > before_row["mastery"]

    report = client.get("/forge/impact/report", params={"requester": requester, "days": 30})
    assert report.status_code == 200
    impact = report.json().get("impact", {})
    assert "average_execution_score" in impact
    assert "retention_rate" in impact
