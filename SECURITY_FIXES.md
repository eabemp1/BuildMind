# BuildMind v6 — Security & Reliability Fixes

## Plan guard hardening (monetisation security)

Four API routes were relying solely on client-side plan checks, meaning
a user could bypass paywalls by editing `localStorage` in the browser console.
All four now enforce the plan tier server-side via `checkPlanAccess()` before
any AI call is made.

### Routes fixed

| Route | Required plan | Was guarded? | Now guarded? |
|---|---|---|---|
| `app/api/ai/coach/route.ts` | builder | No (usage limit only) | **Yes** |
| `app/api/cofounder/reframe/route.ts` | builder | No (client-side only) | **Yes** |
| `app/api/cofounder/validation-action/route.ts` | builder | No | **Yes** |
| `app/api/cofounder/blueprint/route.ts` | venture | No | **Yes** |

Routes that were already correctly guarded (unchanged):
- `app/api/ventures/generate/route.ts` → venture ✓
- `app/api/ai/weekly-report/route.ts` → builder ✓

Routes that are intentionally free-tier (no guard needed):
- `app/api/ai/break-my-startup/route.ts` — free tier feature
- `app/api/ai/today-action/route.ts` — free tier feature
- `app/api/ai/onboarding-insight/route.ts` — free tier (pre-auth funnel)
- `app/api/ai/break-public/route.ts` — intentionally public (viral entry)

### How `checkPlanAccess` works

`checkPlanAccess(requiredPlan)` in `app/api/ai/_planCheck.ts`:
1. Reads the Supabase session from the server-side cookie (signed JWT)
2. Reads `user.user_metadata.plan` — cannot be spoofed by the client
3. Returns `{ ok: false, response: 403 }` if the user's real plan is below the required tier
4. Returns `{ ok: true, plan, userId }` if the check passes

This is the same pattern already used by `ventures/generate` and `weekly-report`.

## Database configuration warning

`.env.example` now clearly documents that `DATABASE_URL=sqlite:///./execution_v1.db`
is the development default and **must not be used in production**. SQLite does not
support concurrent writes and will corrupt data under load. The correct production
value is a PostgreSQL connection string.

## runtime.py module map

`app/agent/runtime.py` (6000+ lines) now has a structured docstring at the top
mapping all 11 logical sections with approximate line ranges and a prioritised
refactor roadmap. This makes the file navigable and documents the intended
extraction path without breaking any existing imports.
