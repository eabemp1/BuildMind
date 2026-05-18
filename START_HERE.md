# BuildMind — Run Locally in 3 Steps

No Docker needed. Just Node.js and your Supabase keys.

---

## What you need

- **Node.js 18+** — check with `node -v`
- **A Supabase project** — free at supabase.com
- **A Groq API key** — free at console.groq.com/keys

---

## Step 1 — Install dependencies

```bash
npm install
```

---

## Step 2 — Set up your environment

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in **4 required values**:

```
NEXT_PUBLIC_SUPABASE_URL=      ← from Supabase → Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY= ← from Supabase → Settings → API
SUPABASE_SERVICE_ROLE_KEY=     ← from Supabase → Settings → API
GROQ_API_KEY=                  ← from console.groq.com/keys
```

Payments won't process locally without Paystack keys, but all AI features and auth work.

If you've already deployed to Vercel:
```bash
npm install -g vercel
vercel env pull .env.local
```

---

## Step 3 — Run

```bash
npm run dev
```

Open **http://localhost:3000**

---

## Database setup (first time only)

### Option A — Fresh install (recommended)
Run `supabase/schema-idempotent.sql` in the Supabase SQL editor. This creates all tables in one shot.

Then run the migrations below in order to add features added after the base schema.

### Option B — Run migrations in order
Run each SQL file in your Supabase SQL editor in the order listed:

1. `supabase/migrations/20240115_admin_dashboard_tables.sql`
2. `supabase/migrations/20250505_add_ai_usage_policies.sql`
3. `supabase/migrations/20250505_add_delete_policies.sql`
4. `supabase/migrations/20260419203000_founder_memory.sql`
5. `supabase/migrations/20260425000000_cofounder_core_and_ventures.sql`
6. `supabase/migrations/20260426000000_founder_context_and_momentum.sql`
7. `supabase/migrations/20260429000000_admin_role.sql`
8. `supabase/migrations/20260430000000_align_app_schema.sql`
9. `supabase/migrations/20260502000000_agentic_upgrades.sql`
10. `supabase/migrations/20260503000000_atomic_ai_usage_rpcs.sql`
11. `supabase/migrations/20260504000000_venture_tracks.sql`
12. `supabase/migrations/20260506000000_usage_avatar_daily_stats.sql`
13. `supabase/migrations/20260507000000_reflexion_learning_log.sql`
14. `supabase/migrations/20260508000000_tasks_completed_total.sql`
15. `supabase/migrations/20260510000000_ip_rate_limits.sql`
16. `supabase/migrations/20260510100000_admin_bootstrap.sql`
17. `supabase/migrations/20260511000000_performance_indexes.sql`
18. `supabase/migrations/20260512000000_pattern_detection_columns.sql`
19. `supabase/migrations/20260513000000_project_summaries_view.sql`
20. `supabase/migrations/20260513000001_disable_supabase_cron.sql`
21. `supabase/migrations/20260513000002_admin_rls_policy.sql`
22. `supabase/migrations/20260513_audit_fixes.sql`
23. `supabase/migrations/20260514000000_testimonials.sql`
24. `supabase/migrations/20260514000001_free_trial.sql`
25. `supabase/migrations/20260515000000_daily_ai_cap.sql`
26. `supabase/migrations/20260515000001_welcome_email_sent.sql`
27. `supabase/migrations/20260516000000_re_engagement_tracking.sql`
28. `supabase/migrations/20260516000001_revenue_tracking.sql`
29. `supabase/migrations/20260517000000_conversation_continuity_and_tag_normalization.sql`
30. `supabase/migrations/20260517000001_benchmarks.sql`
31. `supabase/migrations/20260517000002_teams_waitlist.sql`
32. `supabase/migrations/20260517000003_weekly_reports_share.sql`
33. `supabase/migrations/20260517000004_funnel_events.sql`
34. `supabase/migrations/20260517000005_public_profile_optin.sql`
35. `supabase/migrations/20260518000000_morning_checkin_and_depth_answers.sql`
36. `supabase/migrations/20260519000000_funnel_rpc.sql`

---

## Troubleshooting

**"GROQ_API_KEY is not set"** — Add it to `.env.local`, restart `npm run dev`

**Auth not working** — Check your Supabase URL and anon key. Add `http://localhost:3000`
to Supabase → Authentication → URL Configuration → Redirect URLs.

**AI features returning errors** — Check console.groq.com for usage/rate limits.

**Database errors** — Run all migrations in order above. Make sure `SUPABASE_SERVICE_ROLE_KEY`
is set (needed for server-side DB access).

**pgvector errors on migration 29** — Enable the `vector` extension in Supabase Dashboard → 
Database → Extensions → search "vector" → Enable. Required for AI tag embeddings.
