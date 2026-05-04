# BuildMind

Daily execution engine for solo founders. One action per day, AI co-founder with persistent memory, adversarial startup stress-testing, and weekly shareable reports.

## Quick start

```bash
bash setup.sh
```

Or manually:
```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + Groq keys
npm run dev                         # → http://localhost:3000
```

See **START_HERE.md** for detailed setup instructions and troubleshooting.

## Stack

- **Frontend + API routes**: Next.js 15 (App Router)
- **Auth + Database**: Supabase (Postgres)
- **AI**: Groq (llama-3.3-70b-versatile) — free tier available
- **Payments**: Paystack

## Key features

- `/today` — Daily action engine, personalized by stage and blocker
- `/break` — Public viral entry: Break My Startup, no login required
- `/break-my-startup` — Full adversarial analysis (3 roles, rebuttal mode, moat fingerprint)
- `/ai-coach` — AI coach with persistent founder memory
- `/reports` — Weekly report + LinkedIn/X shareable card
- `/onboarding` — 3 questions → brutal insight → workspace

## Environment variables

Minimum required:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GROQ_API_KEY
```

See `.env.local.example` for the full list.

## Database migrations

Run migrations in Supabase SQL editor in order:
```
supabase/migrations/20260419203000_founder_memory.sql
supabase/migrations/20260425000000_cofounder_core_and_ventures.sql
supabase/migrations/20260426000000_founder_context_and_momentum.sql
supabase/migrations/20260429000000_admin_role.sql
supabase/migrations/20260430000000_align_app_schema.sql
supabase/migrations/20260502000000_agentic_upgrades.sql
```

Or use `supabase/schema-idempotent.sql` for a fresh database.

## Deploy

```bash
vercel deploy
```
