# BuildMind

Daily execution engine for solo founders. One action per day, AI co-founder with persistent memory, adversarial startup stress-testing, and weekly shareable reports.

## Quick start

```bash
bash setup.sh
```

Or manually:
```bash
npm install
cp .env.example .env.local   # fill in Supabase + Groq keys
npm run dev                  # → http://localhost:3006
```

See **START_HERE.md** for detailed setup instructions and troubleshooting.

## Stack

- **Frontend + API routes**: Next.js 15 (App Router)
- **Auth + Database**: Supabase (Postgres + RLS)
- **AI**: Groq (openai/gpt-oss-120b) with Cerebras + Gemini fallback
- **Payments**: Paystack
- **Deployment**: Vercel (crons) + optional Render (Docker)

## Key features

- `/today` — Daily action engine, personalized by stage and blocker
- `/break` — Public viral entry: Break My Startup, no login required
- `/break-my-startup` — Full adversarial analysis (3 roles, rebuttal mode, moat fingerprint)
- `/ai-coach` — AI coach with persistent founder memory
- `/reports` — Weekly report + LinkedIn/X shareable card
- `/onboarding` — One sentence → Reflexion Strike → workspace in ~15 seconds

## Environment variables

Minimum required:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GROQ_API_KEY
CRON_SECRET
NEXT_PUBLIC_APP_URL
```

See `.env.example` for the full list including Paystack, VAPID (push), and optional Cerebras/Gemini keys.

## Database setup

### Fresh install (local dev or empty database)

> ⚠️ This drops all tables. Never run on a database with real user data.

```
supabase/schema-idempotent.sql   ← fresh install only
```

### Production (existing database — migrations only)

Run in Supabase SQL editor in this order:

```
supabase/migrations/20240115_admin_dashboard_tables.sql
supabase/migrations/20250505_add_ai_usage_policies.sql
supabase/migrations/20250505_add_delete_policies.sql
supabase/migrations/20260419203000_founder_memory.sql
supabase/migrations/20260425000000_cofounder_core_and_ventures.sql
supabase/migrations/20260426000000_founder_context_and_momentum.sql
supabase/migrations/20260429000000_admin_role.sql
supabase/migrations/20260430000000_align_app_schema.sql
supabase/migrations/20260502000000_agentic_upgrades.sql
supabase/migrations/20260503000000_atomic_ai_usage_rpcs.sql
supabase/migrations/20260504000000_venture_tracks.sql
supabase/migrations/20260506000000_usage_avatar_daily_stats.sql
supabase/migrations/20260507000000_reflexion_learning_log.sql
supabase/migrations/20260508000000_tasks_completed_total.sql
supabase/migrations/20260510000000_ip_rate_limits.sql
supabase/migrations/20260510100000_admin_bootstrap.sql
supabase/migrations/20260511000000_performance_indexes.sql
supabase/migrations/20260512000000_pattern_detection_columns.sql
supabase/migrations/20260513000000_project_summaries_view.sql
supabase/migrations/20260513000001_disable_supabase_cron.sql
supabase/migrations/20260513000002_admin_rls_policy.sql
supabase/migrations/20260514000000_testimonials.sql
supabase/migrations/20260515000000_daily_ai_cap.sql
supabase/migrations/20260515000001_welcome_email_sent.sql
```

## Cron jobs

Vercel handles all scheduled jobs (configured in `vercel.json`). Do **not** run `supabase/cron-schedule.sql` in production — that would duplicate every cron and double push notifications.

## Deploy

```bash
vercel deploy
```

Set all environment variables in Vercel project settings before deploying. See `deployment-required/REQUIRED_PRODUCTION_BILLING.md` for the pre-launch checklist.

