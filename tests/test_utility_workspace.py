from uuid import uuid4

from fastapi.testclient import TestClient

import main


def test_utility_workspace_flow():
    requester = f"utility_tester_{uuid4().hex[:8]}"
    client = TestClient(main.app)

    onb = client.post(
        "/utility/onboarding",
        json={
            "requester": requester,
            "role": "founder",
            "main_goal": "Validate MVP in 60 days",
            "market": "Ghana",
            "stage": "MVP",
            "cohort": "cohort_a",
        },
    )
    assert onb.status_code == 200
    assert onb.json().get("status") == "ok"

    goal = client.post("/utility/goals", json={"requester": requester, "title": "Validate MVP", "target_days": 60})
    assert goal.status_code == 200
    goal_id = (goal.json().get("goal") or {}).get("id")
    assert goal_id

    gen = client.post(f"/utility/goals/{goal_id}/milestones/generate", json={"requester": requester})
    assert gen.status_code == 200
    milestones = gen.json().get("milestones", [])
    assert len(milestones) >= 1

    task = client.post("/utility/tasks", json={"requester": requester, "title": "Interview first 5 users", "goal_id": goal_id})
    assert task.status_code == 200
    task_id = (task.json().get("task") or {}).get("id")
    assert task_id

    done = client.post(f"/utility/tasks/{task_id}/complete", json={"requester": requester})
    assert done.status_code == 200
    assert ((done.json().get("task") or {}).get("status") == "done")

    score = client.get("/utility/scores/current", params={"requester": requester})
    assert score.status_code == 200
    assert score.json().get("execution_score", 0) > 0

    dash = client.get("/utility/dashboard", params={"requester": requester})
    assert dash.status_code == 200
    assert "suggestions" in dash.json()

    resources = client.get("/utility/resources/recommendations", params={"requester": requester})
    assert resources.status_code == 200
    assert len(resources.json().get("resources", [])) >= 1
