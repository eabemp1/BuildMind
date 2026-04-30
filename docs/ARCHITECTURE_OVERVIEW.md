# BuildMind Architecture Overview

## Core idea

BuildMind is a personal-first AI execution coach for early-stage founders. It combines a
Reflexion-loop agent (plan → act → reflect → adapt) with a Founder Context Object that
evolves after every interaction, giving the AI enough memory to give specific, non-generic
advice.

## Stack

### Frontend — Next.js 15 (App Router)
- `app/` — page routes (today, reflect, founder, ventures, etc.)
- `components/` — shared React components (sidebar, topbar, modals, AI widgets)
- `lib/` — client-safe helpers (plan gating, achievements, scoring, notifications)
- Auth: Supabase SSR cookies via `@supabase/ssr`
- Styling: Tailwind CSS + CSS variables (`globals.css`)
- Animation: Framer Motion
- Charts: Recharts
- Analytics: PostHog

### Backend — Supabase
- **Database**: PostgreSQL (managed). All persistent state lives here.
  - `profiles` — user accounts and plan metadata
  - `projects` — founder startup projects
  - `founder_context` — evolving Founder Context Object (agentic memory)
  - `momentum_score` — tracked per user, decays on inactivity
  - See `supabase/migrations/` for full schema history.
- **Auth**: Supabase Auth (JWT, SSR cookies). Plan tier is stored in
  `user.user_metadata.plan` — read server-side only; never trusted from client.
- **Edge Functions**: Deployed via `supabase/functions/`
  - `scheduled-jobs` — Morning Briefing (7am), Evening Check (6pm), momentum decay
  - `send-daily-push` — Web Push notifications via VAPID
- **Row-Level Security**: All tables enforce RLS. Users can only read/write their own rows.

### API routes — Next.js Route Handlers (`app/api/`)
Thin server-side handlers that verify the Supabase session, check plan access via
`checkPlanAccess()`, then call the Reflexion loop or update Supabase state.

| Route group | Purpose |
|---|---|
| `ai/` | Today action, coach, break-my-startup, weekly report, onboarding insight |
| `cofounder/` | Validation action, reframe, blueprint (Builder-gated) |
| `ventures/` | Opportunity generation (Builder-gated) |
| `founder-context/` | Read/write Founder Context Object, HITL overrides |
| `morning-briefing/` | Daily/3×week briefing delivery (plan-aware) |
| `scorecard/` | Execution scorecard generation |
| `billing/` | Paystack + Paddle webhook verification |
| `system/` | Env-status (admin-only), health check |
| `user/` | Profile reads |

### Agent modules (`app/agent/`)
The Reflexion loop and agentic memory live here, extracted from the legacy monolith
into focused modules:

| Module | Responsibility |
|---|---|
| `runtime.py` | Route registration shim + section map (see REFACTOR TARGETS below) |
| `khaya.py` | Khaya language API wrappers (translate, TTS, ASR) |
| `memory.py` | Fact extraction, memory items CRUD, scope management |
| `forge.py` | Forge/evolution features, open-weight tool stubs |
| `workspace.py` | Utility workspace — DuckDuckGo search, http_get_text |

`lib/reflexion.ts` contains the TypeScript Reflexion loop used by Next.js route handlers.
The Python agent modules are invoked for heavier background tasks via Supabase Edge Functions.

## Authentication & authorisation

1. Auth is exclusively handled by Supabase Auth (JWT).
2. Plan tier is read from `user.user_metadata.plan` **server-side only** via
   `checkPlanAccess()` in `app/api/ai/_planCheck.ts`.
3. Admin access is checked via the `is_admin` column in the `profiles` table,
   verified server-side in `app/api/system/admin-check/route.ts`.
   No client-visible env var is used for admin gating.

## Data flow (typical request)

```
Browser → Next.js Route Handler
  → supabase.auth.getUser()          (verify JWT)
  → checkPlanAccess(requiredPlan)    (read user_metadata.plan server-side)
  → lib/reflexion.ts                 (3-agent chain: Planner → Actor → Refiner)
  → supabase.from("founder_context").upsert(...)  (persist updated context)
  → Response to browser
```

## Privacy model

- All user data is scoped by `user_id` with RLS.
- The global event pipeline stores only anonymised, hashed actor identifiers.
- No raw conversation text is logged to any global stream.

## Known constraints & next steps

| Area | Status |
|---|---|
| `app/agent/runtime.py` extraction | In progress — khaya, memory, forge, workspace being split out |
| SQLite (`evolvai_utility.db`) | Dev-only utility cache — replace with Supabase table before scale |
| Python agent server | Local dev only — production path is Edge Functions + Next.js API routes |

## Deployment

- Frontend: Vercel (see `docs/VERCEL_DEPLOY.md`)
- Database + Edge Functions: Supabase (see `supabase/`)
- Environment variables: see `.env.docker.example`
