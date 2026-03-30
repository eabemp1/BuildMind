# BuildMind Architecture Overview

## System overview

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 15 · Vercel)                             │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │  App pages   │  │  /api/ai/*     │  │  Middleware     │  │
│  │  (React)     │  │  (Route handlers)  │  (Supabase SSR) │  │
│  └──────┬───────┘  └───────┬────────┘  └────────────────┘  │
│         │                  │                                  │
└─────────┼──────────────────┼──────────────────────────────────┘
          │                  │
          ▼                  ▼
┌─────────────────┐  ┌───────────────────────────────┐
│  Supabase       │  │  Groq API (llama-3.3-70b)     │
│  · Auth (JWT)   │  │  Primary AI provider           │
│  · projects     │  │  Called directly from          │
│  · milestones   │  │  Next.js API routes            │
│  · tasks        │  └──────────────┬────────────────┘
│  · ai_usage     │                 │ (fallback only)
│  · notifications│                 ▼
└─────────────────┘  ┌───────────────────────────────┐
                     │  Python FastAPI (Render.com)   │
                     │  STATELESS AI/scoring service  │
                     │  · POST /api/v1/ai/coach       │
                     │  · POST /api/v1/ai/milestones  │
                     │  · POST /api/v1/ai/break-my-startup │
                     │  · GET  /api/v1/scoring/*      │
                     │  · POST /api/v1/weekly-reports │
                     │                                │
                     │  Own SQLite/Postgres DB for:   │
                     │  · execution_score_history     │
                     │  · weekly_reports              │
                     │  · activity_logs               │
                     │  · reminder_preferences        │
                     │  · users (stub mirrors only)   │
                     └───────────────────────────────┘
```

## Data ownership rules (critical — read before writing any code)

| Data | Owned by | Never write from |
|---|---|---|
| User auth / sessions | Supabase Auth | Python backend |
| projects, milestones, tasks | Supabase DB | Python backend |
| ai_usage, notifications | Supabase DB | Python backend |
| execution_score_history | Python backend DB | Frontend directly |
| weekly_reports | Python backend DB | Frontend directly |
| reminder_preferences | Python backend DB | Frontend directly |

**The Python backend is a stateless service.** It never reads Supabase for project data — the frontend sends all necessary context in each request payload. It writes only to its own tables listed above.

## Auth flow

```
User logs in → Supabase issues JWT
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
  Frontend calls          Frontend calls
  Supabase directly       /api/ai/* routes
  (with Supabase JWT)     (Next.js validates
                           Supabase JWT via
                           SUPABASE_SERVICE_ROLE_KEY)
                                │
                                │ (fallback only)
                                ▼
                         Python backend
                         validates same JWT
                         via SUPABASE_JWT_SECRET
```

**There is one auth system: Supabase.** The Python backend's legacy `/auth/login` route (internal JWT) exists for local development only and is not used in production.

## Environment variables

### Frontend (`frontend/.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile

NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

NEXT_PUBLIC_API_BASE_URL=https://your-backend.onrender.com/api/v1
NEXT_PUBLIC_CHECKOUT_URL=https://buy.stripe.com/...
```

### Python backend (`.env`)
```env
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
SUPABASE_JWT_SECRET=your_supabase_jwt_secret   # from Supabase → Settings → API → JWT Secret
DATABASE_URL=sqlite:///./buildmind.db           # or postgresql://...
SECRET_KEY=change-this-in-production
FRONTEND_ORIGINS=https://your-app.vercel.app
ENABLE_WEEKLY_REPORT_CRON=1
```

## PostHog analytics

PostHog is initialized in `frontend/components/providers.tsx` via `initAnalytics()`.

Key events tracked:
- `user_signed_in` — on login
- `user_signed_up` — on signup
- `onboarding_completed` — when project created from onboarding
- `today_action_completed` — when user marks daily action done
- `ai_coach_used` — every AI coach message
- `break_startup_run` — when analysis runs
- `upgrade_viewed` — on upgrade page visit
- `upgrade_clicked` — on CTA click

To add a new event: `trackEvent('event_name', { key: value })` from `@/lib/analytics`.

## Mobile-first design

All pages use a mobile-first layout:
- The sidebar collapses to a bottom tab bar on screens < 768px
- All cards use `max-width` + `width: 100%` so they fill small screens
- Font sizes, padding, and touch targets are sized for mobile (min 44px tap targets)
- The `AppShell` handles responsive layout switching

## Supabase schema

```sql
-- Required tables (already exist in production)
users          (id uuid, email, full_name, avatar_url, onboarding_completed, ...)
projects       (id uuid, user_id, title, description, target_users, problem,
                startup_stage, validation_score, execution_score, progress, ...)
milestones     (id uuid, project_id, title, order_index, status, is_completed, ...)
tasks          (id uuid, milestone_id, title, notes, is_completed, ...)
ai_usage       (id uuid, user_id, month, count)
notifications  (id uuid, user_id, type, message, is_read, created_at)

-- Create if missing
create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  month text not null,
  count integer not null default 0,
  unique(user_id, month)
);
```
