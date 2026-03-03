# EvolvAI OS

EvolvAI OS is a unified FastAPI backend and Next.js frontend for founder execution support.

## What This Is

- Not a generic chatbot.
- A structured execution platform with:
  - goal/project tracking
  - roadmap and milestones
  - task completion workflows
  - execution scoring
  - utility/agent support modules

## Current Architecture

Single backend codebase:

```
app/
  main.py
  database.py
  core/
  models/
  schemas/
  services/
  routes/
  execution/
  agent/
```

Frontend dashboard:

```
frontend/
  app/
  components/
  lib/
```

## Backend Highlights

- `app/routes`: API endpoints only (thin handlers).
- `app/services`: business logic.
- `app/execution`: scoring + roadmap logic.
- `app/agent`: memory/reflection + utility agent interfaces.
- `app/models`: SQLAlchemy ORM models.
- `app/schemas`: Pydantic request/response contracts.
- `app/core`: shared auth/dependency/security helpers.

## Data Layer

- Execution platform data uses SQLAlchemy ORM (`app/database.py`) with SQLite/PostgreSQL via `DATABASE_URL`.
- Runtime artifacts/state files are generated locally and are no longer tracked in git.

## Quick Start (Backend)

1. Create and activate virtual environment.
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Run API:
   - `python main.py`
4. Open:
   - `http://127.0.0.1:8000`

## Quick Start (Frontend)

1. `cd frontend`
2. `npm install`
3. `npm run dev`
4. Open:
   - `http://localhost:3000/dashboard`

## Key Execution Endpoints

- `POST /register`
- `POST /login`
- `POST /projects`
- `POST /projects/{id}/generate-roadmap`
- `GET /projects/{id}`
- `POST /tasks/{id}/complete`
- `GET /dashboard`
- `POST /feedback`

## Test Commands

- Core execution + utility flow:
  - `venv\Scripts\python -m pytest -q tests/test_execution_v1_api.py tests/test_utility_workspace.py tests/test_mvp_flows.py`

## Repository Hygiene

- Removed duplicate backend trees and legacy tracked runtime artifacts.
- `.gitignore` now excludes generated state/cache/db files so the repo stays clean.
