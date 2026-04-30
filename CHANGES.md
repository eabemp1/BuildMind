# BuildMind v5 — Cleanup & Hardening Changelog

## Route conflict fixes

### `/overview` route collision (critical)
- **Removed** `app/overview/page.tsx` — this standalone page had its own inline
  navigation with no AppShell/sidebar. It competed with
  `app/(dashboard)/overview/page.tsx` for the same `/overview` URL in Next.js,
  meaning users could randomly land on the wrong UI depending on build order.
- **Canonical route** is now exclusively `app/(dashboard)/overview/page.tsx`,
  which is correctly wrapped in AppShell with the sidebar and topbar.

### Dead duplicate UI components removed
- **Removed** `components/sidebar.tsx` — duplicate of `components/layout/sidebar.tsx`.
  Nothing in the codebase imported it (verified by grep across all `.tsx`/`.ts` files).
- **Removed** `components/topbar.tsx` — duplicate of `components/layout/topbar.tsx`.
  Same situation.

## Directory cleanup

### `backend/` subdirectory removed
The `backend/` subdirectory contained its own `Dockerfile`, `requirements.txt`,
and a single route file (`app/routes/break_startup.py`). This route was already
superseded by the Next.js API route at `app/api/ai/break-my-startup/route.ts`.
Keeping it created confusion about which backend handled which requests. Removed.

### `static/` directory removed
`static/` held pre-built HTML/JS/CSS artifacts from the old Lumiere agent UI
(a previous iteration of the product). The FastAPI main app never mounted a
`StaticFiles` handler for `/static`, so these files were never actually served.
They were dead build artifacts consuming space. Removed.

## Docker Compose fix

`docker-compose.yml` had the frontend service pointing to `context: ./frontend/`,
a directory that doesn't exist. The Next.js app lives at the project root (`.`).
Fixed to `context: .` with `dockerfile: Dockerfile`.
Also added explicit `ARG` pass-through so all `NEXT_PUBLIC_*` env vars reach
the Next.js build step correctly.

## Schema management

### `_ensure_runtime_schema()` removed from `app/main.py`
The ~120-line function that ran raw `ALTER TABLE` SQL on every server boot has
been removed. Schema changes are now managed exclusively through Alembic.

### Migration `0002_add_missing_columns.py` added
`app/db/migrations/versions/0002_add_missing_columns.py` contains all the column
additions and table creations that the old runtime function performed. It is
idempotent (uses `IF NOT EXISTS` / column existence checks) so it is safe to
run against both fresh databases and existing ones.

To apply:
```bash
alembic upgrade head
```

## New files

### `lib/server/planGuard.ts`
Server-side plan enforcement for Next.js Route Handlers. Reads the user's plan
from Supabase `user_metadata` (signed JWT, server-side) rather than from
`localStorage`. Wrap any paid-tier API route with `withPlanGuard("venture", handler)`
to prevent client-side bypass.

Routes to protect (not yet wrapped — audit these):
- `app/api/ventures/generate/route.ts` → `"venture"`
- `app/api/cofounder/blueprint/route.ts` → `"venture"`
- `app/api/ai/coach/route.ts` → `"builder"`
- `app/api/ai/weekly-report/route.ts` → `"builder"`

### `tests/test_scoring_logic.py`
13 unit tests for `app/execution/scoring.py` covering:
- Zero-state safety (no divide-by-zero on new users)
- Task completion rate calculation (full and partial)
- Weekly consistency with ISO week deduplication
- Focus score with single and split milestone work
- Feedback positivity ratio
- Score weight validation (task_completion_rate = 30%)
- `store_weekly_score` DB write and same-week upsert

### `.github/workflows/frontend-ci.yml`
Complements the existing `backend-ci.yml`. Runs on every push/PR touching
frontend files:
- **unit** — Vitest with coverage report artifact
- **typecheck** — `tsc --noEmit`
- **lint** — `next lint`
- **build** — full `next build` with stubbed env vars
- **audit** — `npm audit --audit-level=high`
