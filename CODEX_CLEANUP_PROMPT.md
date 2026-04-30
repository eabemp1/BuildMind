# BuildMind — Cleanup Implementation Guide for Codex

This document describes every change made to the codebase in the cleanup pass and how to implement them. Apply all changes in order.

---

## 1. Fix the critical auth collision (`app/main.py`)

**Problem:** `from app.agent.runtime import *` imports the entire Lumiere agent runtime including its own `FastAPI` app instance called `app`, its flat-file user/session store, and ~60 functions into the main module namespace. This overwrites or conflicts with the platform's JWT auth.

**Fix:** Replace the star import with an explicit import of just the agent's `app` object, then mount it as an isolated sub-application at `/agent/*`.

```python
# BEFORE (line 21 of original main.py):
from app.agent.runtime import *  # noqa: F401,F403

# AFTER:
from app.agent.runtime import app as lumiere_app  # explicit, isolated

# Then after app = FastAPI(title="EvolvAI OS"):
app.mount("/agent", lumiere_app)
```

The full replacement `app/main.py` is included in this zip. The key changes are:
- Star import → explicit `from app.agent.runtime import app as lumiere_app`
- Agent mounted as sub-app: `app.mount("/agent", lumiere_app)`
- `/agent` added to the `skip_prefixes` set in `_install_v1_aliases()`
- Rate limiter state wired: `app.state.limiter = limiter` and exception handler added

---

## 2. Add a shared rate limiter (`app/core/rate_limit.py`)

Create this new file:

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
```

Add `slowapi==0.1.9` to `requirements.txt`.

---

## 3. Rate-limit all AI endpoints (`app/routes/ai.py`)

Every endpoint that calls an LLM must be decorated with `@limiter.limit(...)`.

```python
from fastapi import Request
from app.core.rate_limit import limiter

@router.post("/ai/coach")
@limiter.limit("20/minute")
def ai_coach_endpoint(request: Request, payload: dict, db: Session = Depends(get_db)):
    ...

@router.post("/ai/milestones")
@limiter.limit("30/minute")
def ai_milestones_endpoint(request: Request, payload: dict):
    ...
```

The `request: Request` parameter is **required** for slowapi — it must be the first parameter after `self` (if any).

---

## 4. Rate-limit roadmap generation (`app/routes/projects.py`)

```python
from fastapi import Request
from app.core.rate_limit import limiter

@router.post("/projects/{project_id}/generate-roadmap")
@limiter.limit("10/minute")
def generate_roadmap_endpoint(
    request: Request,   # ← add this as first param
    project_id: int,
    ...
):
```

---

## 5. Wire the limiter into `app/main.py`

Add these imports at the top of main.py:

```python
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.rate_limit import limiter
```

Then after `app = FastAPI(title="EvolvAI OS")`:

```python
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

---

## 6. Add auth integration tests (`tests/test_auth_integration.py`)

The full test file is included in this zip. It covers:
- Registration creates a DB record (not a flat file)
- Login returns a proper JWT with `bearer` token type
- Wrong password / unknown email → 401
- Valid JWT → 200 on protected routes
- Invalid/tampered JWT → 401
- `X-Auth-Token` (agent auth header) does NOT grant access to platform routes
- `/api/v1/health` is publicly accessible

Run with:
```bash
pytest tests/test_auth_integration.py -v
```

---

## 7. Verify the agent routes still work

After mounting at `/agent`, the Lumiere agent routes move from `/ask` → `/agent/ask`, `/auth/login` → `/agent/auth/login`, etc.

If your frontend or any script calls the old paths, update them:

| Old path | New path |
|---|---|
| `GET /ask` | `GET /agent/ask` |
| `POST /auth/login` (agent) | `POST /agent/auth/login` |
| `POST /auth/register` (agent) | `POST /agent/auth/register` |
| `GET /health` (agent) | `GET /agent/health` |

The platform auth routes at `/api/v1/auth/login` and `/api/v1/auth/register` are **unchanged**.

---

## 8. Smoke test checklist

After applying changes:

```bash
# Install dependencies
pip install -r requirements.txt

# Run DB migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload

# Verify health
curl http://localhost:8000/api/v1/health
# → {"success": true, "data": {"status": "ok"}}

# Verify agent is isolated
curl http://localhost:8000/agent/health
# → {"status": "ok", "service": "lumiere"} or similar

# Verify platform auth requires JWT
curl http://localhost:8000/api/v1/projects
# → {"success": false, "error": "http_error", "detail": "Not authenticated"}

# Run all tests
pytest tests/ -v
```

---

## Summary of files changed

| File | Change |
|---|---|
| `app/main.py` | Replaced star import; mounted agent as sub-app; wired rate limiter |
| `app/routes/ai.py` | Added `@limiter.limit()` decorators to all AI endpoints |
| `app/routes/projects.py` | Added `@limiter.limit("10/minute")` to generate-roadmap |
| `app/core/rate_limit.py` | **New file** — shared limiter instance |
| `requirements.txt` | Added `slowapi==0.1.9` |
| `tests/test_auth_integration.py` | **New file** — auth system integration tests |

---

## Pass 2 — Production-readiness (9.5+ fixes)

### 9. Python backend CI (`.github/workflows/backend-ci.yml`)

New file. Runs on every push to `main`/`develop` that touches backend files. Two jobs:
- `test`: runs `pytest tests/ -v` against SQLite on Python 3.11 and 3.12
- `lint`: runs `ruff check` on `app/` and `tests/`

Secrets required in GitHub → Settings → Secrets: none for CI (uses SQLite + empty GROQ key).

### 10. First Alembic migration (`app/db/migrations/versions/0001_initial_schema.py`)

The `versions/` directory was empty (just `.gitkeep`). This migration creates all 18 platform tables in order with correct foreign key relationships and `downgrade()` support. Run with:
```bash
alembic upgrade head
```
After this, `_ensure_runtime_schema()` in `main.py` becomes a safety net only — Alembic is the source of truth.

### 11. Typed AI request schemas (`app/schemas/buildmind.py` + `app/routes/ai.py`)

`payload: dict` replaced with proper Pydantic models:
- `AiCoachRequest` — validates `question`/`message` (max 4000 chars), optional `projectId` and `project`
- `AiMilestonesRequest` — validates `idea`/`description` (max 2000 chars)
- `SystemSettingRequest` — validates admin `key` + `value_json`

FastAPI now returns `422 Unprocessable Entity` with field-level error messages for bad input instead of crashing or silently ignoring fields.

### 12. Consolidated password field (`app/models/models.py`)

Removed the duplicate `password_hash` DB column. It is now a Python `@property` that aliases `hashed_password`, so all existing code reading `user.password_hash` continues to work without a DB column change. `auth_service.py` updated to only write `hashed_password`.

### 13. Rate limit tests (`tests/test_rate_limiting.py`)

Covers: first request not rate-limited, empty `idea` → 422 (not 500), roadmap endpoint protected (not 500), rapid requests don't 500 the server.

### 14. Dev tooling

`ruff>=0.4.0` added to `requirements.txt` for local and CI linting. `ENABLE_WEEKLY_REPORT_CRON` and `AGENT_MOUNT_PREFIX` documented in `.env.docker.example`.

### Updated smoke test

```bash
# Verify the migration
alembic upgrade head
alembic history  # should show 0001_initial_schema as "head"

# Verify typed schemas reject bad input
curl -X POST http://localhost:8000/api/v1/ai/milestones \
  -H "Content-Type: application/json" \
  -d '{}'
# → {"detail":[{"loc":["body"],"msg":"..."}]}  (422, not 500)

# Run all tests
pytest tests/ -v
# → 25+ tests, all passing

# Run linter
ruff check app/ tests/
```
