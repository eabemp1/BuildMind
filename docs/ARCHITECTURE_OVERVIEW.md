# Lumiere MVP Architecture

## Core idea
- Personal-first agent platform with per-user evolving companion (`personal`).
- Specialist agents route by keyword/category.
- Marketplace logic allows explicit trade/rent.
- Global improvement pipeline uses anonymized telemetry only.

## Runtime
- `main.py`: API routes + orchestration.
- `lumiere/ui_home.py`: server-rendered home/welcome HTML.
- `static/app.js`, `static/app.css`: front-end behavior and styling.
- `lumiere/reminder_scheduler.py`: local Windows reminder worker.

## Data
- `agents.json`: agent state + memory profiles.
- `blockchain_state.json`: token/rental/transaction mock state.
- `reminders.json`: reminder list.
- `user_profile.json`: profile + model + base settings.
- `user_privacy.json`: per-actor anonymized sharing preferences.
- `global_events.jsonl`: anonymized event stream.
- `datasets/`: generated dataset snapshots from events.

## Privacy model
- Default is configurable per actor.
- Event pipeline stores hashed actor identifiers only.
- No raw chat text is logged into global events.

## Known MVP constraints
- Single-process monolith (`main.py`) remains large.
- Identity is requester-string based, not auth-backed yet.
- Marketplace is mock-chain logic, not real on-chain.
