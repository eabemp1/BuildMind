# BuildMind — Security & Reliability Notes

## Plan guard enforcement

Four API routes previously relied on client-side plan checks; all now enforce
plan tier server-side via `checkPlanAccess()` before any AI call.

| Route | Required plan | Server-guarded |
|---|---|---|
| `app/api/ai/coach/route.ts` | builder | ✅ |
| `app/api/cofounder/reframe/route.ts` | builder | ✅ |
| `app/api/cofounder/validation-action/route.ts` | builder | ✅ |
| `app/api/cofounder/blueprint/route.ts` | builder | ✅ |
| `app/api/ventures/generate/route.ts` | builder | ✅ |
| `app/api/ai/weekly-report/route.ts` | builder | ✅ |

Intentionally free-tier (no guard):
- `app/api/ai/break-my-startup/route.ts` — free feature
- `app/api/ai/today-action/route.ts` — free feature
- `app/api/ai/onboarding-insight/route.ts` — pre-auth funnel
- `app/api/ai/break-public/route.ts` — viral entry, intentionally public

## How `checkPlanAccess` works

`checkPlanAccess(requiredPlan)` in `app/api/ai/_planCheck.ts`:
1. Reads the Supabase session from the server-side cookie (signed JWT)
2. Reads `user.user_metadata.plan` — cannot be spoofed by the client
3. Returns `{ ok: false, response: 403 }` if below the required tier
4. Returns `{ ok: true, plan, userId }` if the check passes

## Database

`DATABASE_URL=sqlite:///./execution_v1.db` is the development default only.
SQLite does not support concurrent writes. Use a PostgreSQL connection string in production.
