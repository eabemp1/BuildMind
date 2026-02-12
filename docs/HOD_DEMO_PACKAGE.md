# HOD Demo Package

## Demo objective
Show a personal, ownable, evolving AI companion MVP with privacy-aware global learning.

## 5-minute demo flow
1. Set identity to `Emmanuel`.
2. Ask finance/coding/reminder prompts and show routed `Answered by`.
3. Create timed reminder and show in-app reminder list.
4. Show ownership behavior (personal scoped per requester).
5. Show anonymized telemetry toggle and dataset snapshot generation.

## Commands (local)
```powershell
python scripts/seed_demo_data.py
python main.py
```

Open: `http://127.0.0.1:8000`

## What to show in UI/API
- Ask routes: `/ask`, `/ask-live`
- Reminder routes: `/reminders`, `/reminders/due`
- Privacy routes:
  - `GET /privacy/share-anonymized?requester=Emmanuel`
  - `POST /privacy/share-anonymized` with `{ "requester":"Emmanuel", "enabled": true }`
- Dataset route: `POST /datasets/build`

## Talking points
- Personal AI is exclusive unless explicitly traded/rented.
- Learning is local-first, with optional anonymized global contribution.
- Dataset artifacts can evolve into Lumiere-native model training assets.
