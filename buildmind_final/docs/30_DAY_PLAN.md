# 30-Day Execution Plan

## Week 1: Demo hardening
- Freeze MVP scope.
- Run `scripts/seed_demo_data.py` and validate demo script.
- Fix top 10 reliability issues from manual walkthrough.
- Validate anonymized telemetry and privacy toggle behavior.

## Week 2: Engineering foundation
- Install and run tests (`pytest`).
- Add CI checks (lint/test) in your preferred pipeline.
- Add endpoint-level smoke test checklist.
- Start extracting modules from `main.py` (memory/chain/reminders).

## Week 3: Multi-tenant prep
- Define auth model and identity contract.
- Design per-user storage partition keys.
- Draft migration plan from JSON files to DB schema.
- Build access-control matrix for all endpoints.

## Week 4: Production readiness prep
- Error handling and structured logs review.
- Add rate-limit and abuse-prevention plan.
- Finalize security checklist and threat model.
- Prepare pilot-readiness report and next funding ask.

## Daily engineering growth routine (90 mins)
- 30 min: backend fundamentals practice.
- 30 min: read/refactor one module.
- 30 min: write tests for one flow.
