import json
from datetime import datetime, timedelta, timezone
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main():
    now = datetime.now(timezone.utc)
    profile = {
        "name": "Emmanuel",
        "theme": "system",
        "accent": "#22d3ee",
        "model": "groq-llama3.3",
        "share_anonymized": True,
    }
    reminders = [
        {
            "id": "demo001",
            "text": "Review Lumiere MVP script",
            "done": False,
            "created_at": now.isoformat(),
            "due_at": (now + timedelta(minutes=25)).isoformat(),
        },
        {
            "id": "demo002",
            "text": "Prepare HOD demo talking points",
            "done": False,
            "created_at": now.isoformat(),
            "due_at": (now + timedelta(hours=2)).isoformat(),
        },
    ]

    usage_log = {"agents": {}, "updated_at": now.isoformat()}
    global_core = {
        "version": 1,
        "total_interactions": 0,
        "total_ratings_up": 0,
        "total_ratings_down": 0,
        "signals": {
            "helpfulness": 0.5,
            "memory_clarity": 0.5,
            "routing_confidence": 0.5,
            "tone_warmth": 0.5,
        },
        "updated_at": now.isoformat(),
    }

    write_json(BASE_DIR / "user_profile.json", profile)
    write_json(BASE_DIR / "reminders.json", reminders)
    write_json(BASE_DIR / "usage_log.json", usage_log)
    write_json(BASE_DIR / "global_core_state.json", global_core)
    (BASE_DIR / "global_events.jsonl").write_text("", encoding="utf-8")

    datasets_dir = BASE_DIR / "datasets"
    datasets_dir.mkdir(exist_ok=True)

    print("Demo seed complete.")
    print(f"Profile: {(BASE_DIR / 'user_profile.json')}")
    print(f"Reminders: {(BASE_DIR / 'reminders.json')}")
    print(f"Events reset: {(BASE_DIR / 'global_events.jsonl')}")


if __name__ == "__main__":
    main()
