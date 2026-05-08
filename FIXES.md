# BuildMind — Surgical Fixes Applied

**Date:** 2026-05-08  
**Source:** BuildMind-merged (base, larger zip) + UX progressive-unlock changes from BuildMind-patched

---

## Merge Strategy

- **Base:** `BuildMind-merged.zip` (935 KB, 514 files, 2026-05-07) — contains the full `app/` directory with all routes, plus the `.tmp_playbook/` assets not in patched.
- **UX overlay from patched:** `components/layout/sidebar.tsx`, `lib/nav-config.ts`, `lib/queries.ts` — the progressive feature-unlock system gating the sidebar by tasks completed.
- **Patched-only additions:** `__tests__/`, `LICENSE`, `vercel.json`, `Dockerfile`, `package.json`, `.env.example`, `vitest.config.ts`, `scripts/`, `deployment-required/`, `UNGATED_PREVIEW.md`, `ISSUES_SUMMARY.md`, `PRODUCTION_BLOCKERS_FIXED.md`.
- **Temp files removed:** `.tmp_buildmind_push/`, `.tmp_playbook/`, `build.log`, `build-output.txt`.

---

## Bugs Fixed (from BuildMind-Audit.html)

### 🔴 CRITICAL (production-breaking)

**Fix 1 — `reflect-action/route.ts:84` — TypeScript build error (`.catch()` on `PromiseLike`)**  
`groqJSON()` returns a `PromiseLike` that does not expose `.catch()`. Chaining `.catch()` caused a TypeScript error that failed the Next.js build on Vercel. The entire `/api/ai/reflect-action` route returned 500 in production — reflections were not written and the AI never learned from them.  
*Changed:* Wrapped `groqJSON()` call in `try/catch`. Fallback is applied in the `catch` block.  
`app/api/ai/reflect-action/route.ts`

**Fix 2 — `reflect/page.tsx` — Stage hardcoded to `"Idea"` for all reflections**  
Every reflection was analyzed as if the founder was at Idea stage, regardless of actual stage. A Launch-stage founder with paying users got "talk to 5 people" advice.  
*Changed:* Added `startupStage` state, fetched from `project_summaries` on load, passed as `stage` in the reflect-action POST.  
`app/reflect/page.tsx`

**Fix 3 — `today-action/route.ts` — Double API call (4–6 Groq calls per load)**  
Route called `groqJSON()` first to generate a `TodayAction` seed, then passed it into `runReflexionLoop()` which runs 3–4 model calls itself. Total: 4–6 Groq calls per Today page load. Free-tier founders hit their 30-call monthly limit in 5–6 days.  
*Changed:* Removed the pre-call `groqJSON()`. Founder context is built directly as a text seed and passed into Agent A. Reflexion loop runs once. Per-load cost: 2–3 calls instead of 4–6. `groqJSON` removed from import.  
`app/api/ai/today-action/route.ts`

**Fix 4 — `today/page.tsx` — `founder_context` never written on check-in**  
`days_inactive`, `tasks_accepted_this_week`, `momentum_score`, `last_active` were only updated by the 5am cron. A founder checking in at 9am was invisible to the AI for 20 hours.  
*Changed:* After check-in submission, fires a `PATCH /api/founder-context` with `tasks_accepted_this_week_increment: 1`, `days_inactive: 0`, `last_active: today`.  
`app/today/page.tsx`

---

### 🟡 HIGH (data integrity / silent failure)

**Fix 5 — `app/api/system/env-status/route.ts` — `CRON_SECRET` not validated**  
If `CRON_SECRET` is missing from Vercel env vars, every cron route returns `401 Unauthorized` silently — no morning briefings, no evening checks, no weekly reports. No alert was raised.  
*Changed:* Added `CRON_SECRET` and `NEXT_PUBLIC_APP_URL` to the `/api/system/env-status` check.  
`app/api/system/env-status/route.ts`

**Fix 6 — Multiple API routes — `projects.name` vs `title` column mismatch**  
Supabase schema defines `projects.name` but several routes selected `title`, causing silent nulls. Project names disappeared in some UI contexts and the AI received "N/A" for project name.  
*Changed:* Added `name` to SELECT queries. All `project.title` references now use `(project.name ?? project.title)` fallback.  
`app/api/ai/today-action/route.ts`, `today-action/stream/route.ts`, `reflect-action/route.ts`, `coach/route.ts`, `break-my-startup/route.ts`

**Fix 7 — `vercel.json` — Dual cron-fire risk warning**  
`vercel.json` and `supabase/cron-schedule.sql` both define cron jobs for `morning_briefing` and `evening_check`. If both are active, founders receive double push notifications and the AI usage counter increments twice per check-in.  
*Changed:* Documented the conflict in `CODEX_AUDIT_REPORT.md`. Do not add a `_WARNING` field to `vercel.json`; Vercel rejects additional top-level properties.  
`CODEX_AUDIT_REPORT.md`, `vercel.json`

**Fix 8 — Progressive sidebar unlock (`bm_tasks_completed_total`) was localStorage-only**  
Switching devices or clearing the browser reset the unlock counter to zero. SSR always returned 99 (show all), so the progressive reveal was only felt on first device.  
*Changed:*  
- New migration: `supabase/migrations/20260508000000_tasks_completed_total.sql` — adds `tasks_completed_total int4` to `founder_context`.  
- `task-complete` route now increments `tasks_completed_total` and returns it in the response.  
- `today/page.tsx` syncs the server value back to localStorage after each check-in (takes the max, so offline writes are preserved).  
- `lib/nav-config.ts` exports `syncTasksCompletedFromServer()` — async function that reconciles localStorage with Supabase.  
- `components/layout/sidebar.tsx` calls `syncTasksCompletedFromServer()` on mount.  
`supabase/migrations/`, `app/api/founder-context/task-complete/route.ts`, `lib/nav-config.ts`, `components/layout/sidebar.tsx`, `app/today/page.tsx`

**Fix 9 — `reflect/page.tsx` — Reflect history was localStorage-only**  
Switching devices erased the last 30 reflections shown as "your pattern" and sent to the AI. The AI generated generic responses for retained founders on a new device.  
*Changed:* On mount, fetches last 30 reflections from `reflections` table and seeds localStorage. Runs alongside the stage fetch in the same `Promise.allSettled` call.  
`app/reflect/page.tsx`

---

## UX Changes (from BuildMind-patched)

**Progressive sidebar unlock (prevent new-user overload)**  
New users only see `Today` and `Notifications` initially. Features unlock based on tasks completed:
- 0 tasks → Today, Notifications, Settings  
- 1 task → + Reflect  
- 3 tasks → + Overview, Projects, Ventures  
- 7 tasks → + AI Coach, Break Startup, Reports, Achievements, Invite  
- 14 tasks → everything  

Features beyond the next tier are hidden entirely (not shown as locked). Only the *next* unlock tier is shown as a subtle "N tasks away" hint.  

`components/layout/sidebar.tsx`, `lib/nav-config.ts`

---

## Run the Migration

Before deploying, run in your Supabase SQL editor or via migration:

```sql
ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS tasks_completed_total int4 NOT NULL DEFAULT 0;
```

Or apply: `supabase/migrations/20260508000000_tasks_completed_total.sql`
