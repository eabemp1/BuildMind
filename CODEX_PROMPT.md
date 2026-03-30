# BuildMind — Codex Reference (v2, authoritative)

## What this repo is

BuildMind is a daily action engine for solo startup founders. It gives one concrete task per day based on the founder's startup stage, tracks execution with a score, and provides AI coaching via BuildMini. The core retention mechanic is a Duolingo-style streak + celebration loop.

---

## Repository layout

```
buildmind_final/
├── frontend/              ← Next.js 15 App Router (Vercel)
│   ├── app/               ← Pages + Next.js API routes
│   ├── components/        ← Sidebar, BottomNav, AppShell, UI
│   ├── lib/               ← Supabase, analytics, API clients
│   └── middleware.ts      ← Auth guard (Supabase SSR)
├── app/                   ← Python FastAPI backend (Render.com)
│   ├── routes/            ← API route handlers
│   ├── services/          ← Business logic
│   ├── models/            ← SQLAlchemy ORM (backend-only tables)
│   └── core/              ← Auth, config, deps
├── tests/                 ← Backend pytest suite
├── requirements.txt
├── render.yaml
└── CODEX_PROMPT.md        ← This file
```

---

## Architecture — read before writing any code

### The single most important rule

**There are two databases. They own different things. Never mix them.**

| What | Where | Who writes |
|---|---|---|
| users, projects, milestones, tasks | **Supabase** | Frontend only |
| ai_usage, notifications | **Supabase** | Frontend + Next.js API routes |
| execution_score_history, weekly_reports, activity_logs, reminder_preferences | **Python backend SQLite/Postgres** | Python backend only |

The Python backend is a **stateless AI/scoring service**. It never reads Supabase for project data. The frontend sends all needed context in each request body. The backend only writes to its own tables.

### Auth — one system, two validators

There is **one auth system: Supabase**. Both the frontend and the Python backend validate the same Supabase-issued JWT.

- Frontend → Supabase directly (via `@supabase/ssr`)
- Next.js API routes → validate via `SUPABASE_SERVICE_ROLE_KEY`
- Python backend → validate via `SUPABASE_JWT_SECRET` (see `app/core/deps.py`)
- The Python backend's internal JWT (`/auth/login`) is legacy — only for local dev, never for production

### Data flow for AI features

```
User action in browser
  → Next.js API route (/app/api/ai/*)
      → Fetch project context from Supabase (service role)
      → Call Groq directly (primary)
      → Fallback: POST to Python backend /api/v1/ai/* with context in body
          → Python calls Groq using its own GROQ_API_KEY
      → Return response to browser
```

### Mobile-first layout

- `AppShell`: desktop shows 200px sidebar, mobile (< 768px) shows bottom tab bar
- `BottomNav`: 5 core tabs — Today, Overview, Projects, Coach, Settings
- All page content uses `max-width` + `width: 100%` for mobile
- Minimum tap target: 44px height on all interactive elements

---

## Environment variables

### Frontend (`frontend/.env.local`)

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile

NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

NEXT_PUBLIC_CHECKOUT_URL=https://buy.stripe.com/...

# Optional (AI fallback)
NEXT_PUBLIC_API_BASE_URL=https://your-backend.onrender.com/api/v1
```

### Python backend (`.env`)

```env
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
SUPABASE_JWT_SECRET=your_supabase_jwt_secret   # Supabase → Settings → API → JWT Secret
DATABASE_URL=sqlite:///./buildmind.db           # or postgresql://...
SECRET_KEY=random-64-char-string
FRONTEND_ORIGINS=https://your-app.vercel.app,http://localhost:3000
ENABLE_WEEKLY_REPORT_CRON=1
```

---

## Supabase schema

```sql
-- Core tables (must exist)
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  avatar_url text,
  onboarding_completed boolean default false,
  notify_milestone boolean default true,
  notify_task boolean default true,
  created_at timestamptz default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  description text,
  target_users text,
  problem text,
  startup_stage text,
  validation_score float default 0,
  execution_score float default 0,
  momentum_score float default 0,
  progress float default 0,
  roadmap_json text,
  is_public boolean default false,
  created_at timestamptz default now()
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  stage text,
  order_index int default 0,
  status text default 'pending',
  is_completed boolean default false,
  created_at timestamptz default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid references milestones(id) on delete cascade,
  title text not null,
  notes text,
  is_completed boolean default false,
  created_at timestamptz default now()
);

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  month text not null,
  count int not null default 0,
  unique(user_id, month)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  type text not null,
  message text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);
```

---

## Frontend — key files

| File | Purpose |
|---|---|
| `app/page.tsx` | Root: checks auth → redirects to /today or /auth/login |
| `app/today/page.tsx` | Core daily action loop — main retention mechanic |
| `app/(dashboard)/layout.tsx` | Wraps all dashboard pages in AppShell |
| `app/(dashboard)/dashboard/page.tsx` | Metrics overview |
| `app/(dashboard)/projects/page.tsx` | Project list table |
| `app/(dashboard)/projects/[id]/page.tsx` | 4-tab project detail (milestones/tasks/validation/roadmap) |
| `app/(dashboard)/ai-coach/page.tsx` | BuildMini chat |
| `app/(dashboard)/break-my-startup/page.tsx` | Failure analysis |
| `app/(dashboard)/settings/page.tsx` | Profile/account/notifications/AI usage |
| `app/reports/page.tsx` | Weekly mirror |
| `app/upgrade/page.tsx` | $10/mo paywall |
| `app/onboarding/page.tsx` | 3-step project creation wizard |
| `app/api/ai/coach/route.ts` | AI Coach Next.js route → Groq → Python fallback |
| `app/api/ai/break-my-startup/route.ts` | Break analysis → Groq → Python fallback |
| `lib/buildmind.ts` | Supabase data access + TypeScript types |
| `lib/queries.ts` | React Query hooks |
| `lib/analytics.ts` | PostHog — `analytics.*` typed helpers |
| `lib/features.ts` | Feature flags |
| `components/layout/app-shell.tsx` | Responsive wrapper (sidebar ↔ bottom nav) |
| `components/layout/sidebar.tsx` | Desktop nav |
| `components/layout/bottom-nav.tsx` | Mobile bottom tab bar |
| `components/posthog-pageview.tsx` | Auto page view tracking |

---

## Python backend — key routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/v1/ai/coach` | AI coaching — receives project context in body |
| POST | `/api/v1/ai/milestones` | Generate milestones from idea |
| POST | `/api/v1/ai/break-my-startup` | Failure analysis — receives project context in body |
| GET  | `/api/v1/scoring/execution` | Calculate execution score for user |
| POST | `/api/v1/weekly-reports/generate` | Generate weekly report |
| GET  | `/api/v1/weekly-reports/latest` | Get latest report |
| GET  | `/health` | Health check |

**Backend never owns project/task/milestone data.** Always pass context in request body.

---

## PostHog analytics

Initialized in `components/providers.tsx` → `initAnalytics()`.
Page views tracked automatically via `components/posthog-pageview.tsx`.

**Typed event helpers** (use these, not bare `trackEvent`):

```typescript
import { analytics } from "@/lib/analytics";

analytics.userSignedIn(userId);
analytics.userSignedUp(userId);
analytics.onboardingCompleted(projectId);
analytics.todayActionCompleted(stage);
analytics.messageCopied(stage);
analytics.aiCoachUsed(projectId);
analytics.breakStartupRun(projectId);
analytics.upgradeViewed(source);
analytics.upgradeClicked(source);
analytics.projectCreated(projectId);
analytics.taskCompleted(milestoneId);
```

Custom events: `trackEvent('event_name', { key: value })`.

---

## Feature flags (`lib/features.ts`)

```typescript
export const FEATURES = {
  aiCoach: true,
  milestones: true,
  founderScore: true,
  analytics: true,
  breakMyStartup: true,
  notifications: false,      // enable when email infra ready
  publicProjects: false,     // enable for explore/founder pages
  adminPortal: false,        // enable when admin UI ready
  startupCommunity: false,
};
```

---

## User flow

```
/ → check auth
  ├── Not logged in → /auth/login
  └── Logged in → check onboarding
        ├── Not onboarded → /onboarding (3-step wizard → creates project)
        └── Onboarded → /today

/today  (main daily loop)
  ├── Stage pill (current startup stage)
  ├── Action card (copy message → destination chips appear)
  ├── ✓ Done → fire animation + streak counter → /upgrade nudge

/dashboard  → metrics, stage journey, next action
/projects   → project table
/projects/[id] → 4 tabs: milestones | tasks | validation | roadmap
/ai-coach   → BuildMini chat (Groq, 20 msg/month limit)
/break-my-startup → failure analysis (Groq)
/reports    → weekly mirror gauge
/upgrade    → $10/mo Stripe paywall
/settings   → profile | account | notifications | AI usage
```

---

## Paywall touch points (non-blocking)

1. `/today` → Done card → "Unlock Next Step" → `/upgrade`
2. `/projects/[id]` → Roadmap tab → "Unlock full roadmap — $10/mo"
3. `/projects/[id]` → UpgradeNudge after 2 tasks completed in session
4. `/settings` → AI Usage tab → "14/20 messages used"

---

## Running locally

```bash
# Frontend
cd frontend
cp .env.example .env.local
# Fill in SUPABASE, GROQ, POSTHOG keys
npm install
npm run dev    # http://localhost:3000

# Python backend (separate terminal)
cd ..
pip install -r requirements.txt
cp .env.example .env
# Fill in GROQ_API_KEY, SUPABASE_JWT_SECRET
uvicorn app.main:app --reload   # http://localhost:8000
```

---

## Deploying

### Frontend → Vercel
1. Set all env vars in Vercel dashboard (Project → Settings → Environment Variables)
2. `vercel --prod` or connect GitHub repo for auto-deploy

### Backend → Render
`render.yaml` is pre-configured. Set env vars in Render dashboard.

---

## Common Codex tasks

**Add a new page:**
1. Create `frontend/app/(dashboard)/your-page/page.tsx`
2. Add `"use client"` at top
3. Add to sidebar nav in `components/layout/sidebar.tsx`
4. Add to bottom nav in `components/layout/bottom-nav.tsx` if it's a core screen
5. Add feature flag in `lib/features.ts` if gated

**Add a new AI feature:**
1. Create `frontend/app/api/ai/your-feature/route.ts`
2. Fetch project context from Supabase (use `createAdminClient()`)
3. Call `groqJSON()` from `app/api/ai/_utils.ts`
4. Add Python backend fallback route in `app/routes/ai.py`
5. Track with `analytics.yourEvent()`

**Add a new tracked event:**
1. Add typed helper to `analytics` object in `lib/analytics.ts`
2. Call it from the relevant component

**Add a Supabase table:**
1. Create migration in Supabase dashboard or write SQL
2. Add TypeScript type in `lib/buildmind.ts`
3. Add React Query hook in `lib/queries.ts`
