# Issues Summary — fixes attempted since yesterday

This file lists issues we've been working on, the changes attempted, and current status.

- Fix: CRUD batching causing Supabase 400 errors
  - Symptom: `.in()` queries with very large ID arrays caused 400 Bad Request and milestones/tasks failing to render.
  - Action: Implemented batching (BATCH_SIZE=20) across data-fetching code paths.
  - Files changed: `lib/data/projects.ts`, `lib/data/reports.ts`, `app/api/ai/today-action/route.ts`, `app/api/ai/coach/route.ts`, `app/api/ai/break-my-startup/route.ts`, `app/api/ai/weekly-report/route.ts`
  - Status: Fixed (compilation errors resolved; build passes). Verify in production with large projects.

- Fix: Admin dashboard scaffold and API endpoints
  - Symptom: No admin UI for metrics and operator controls.
  - Action: Added `app/admin/page.tsx`, `app/api/admin/dashboard/route.ts`, `app/api/admin/plan-override/route.ts`, and `app/api/analytics/funnel-event/route.ts`.
  - Files changed: new pages and routes, migration SQL added at `supabase/migrations/20240115_admin_dashboard_tables.sql`.
  - Status: Code added and pushed. **Note:** Supabase migration must be executed manually (SQL editor) for DB tables to exist.

- Fix: Middleware protection for admin routes
  - Symptom: Admin routes were unprotected or inconsistent.
  - Action: Updated `middleware.ts` to protect `/admin` (mirrors `/my-ventures` check using `/api/system/admin-check`).
  - Status: Deployed. Verify redirect/403 behavior for non-admin users.

- Fix: Landing badge styling and padding
  - Symptom: Hero badge rendered too wide/incorrect color on some devices.
  - Action: Tightened inline padding from `3px 10px` to `2px 8px` and ensured `var(--bm-accent-*)` variables used.
  - File changed: `app/page.tsx`.
  - Status: Deployed.

- Fix: Today page UX and action card visuals (planned)
  - Symptom: Action card instruction not explicit; AI card looked "flat".
  - Action: Proposed edits in `claude.md` (Today page changes, gradient border, personalising dot). Partial edits may be pending.
  - Status: Please confirm which Today edits you want applied now.

- Fix: Onboarding Reflexion Strike visibility (planned)
  - Symptom: `strikeResult` generated but not shown to user in Step 2.
  - Action: Proposed snippet to show strike preview in `app/onboarding/page.tsx` (not yet verified in prod).
  - Status: Needs review and deployment if desired.

- Fix: Push cron auth for daily notifications (planned)
  - Symptom: Cron used `Authorization` header but route only accepted `x-cron-secret` and POST.
  - Action: Proposed accepting both `Authorization: Bearer` and `x-cron-secret` and accept GET. Not yet applied.
  - Status: Pending (requires code change & deployment).

- Fix: Misc TypeScript/name errors introduced during refactor
  - Symptom: `Cannot find name 'milestones'` after renaming to `allMilestones`.
  - Action: Corrected occurrences in `lib/data/projects.ts` and `lib/data/reports.ts`.
  - Status: Fixed and deployed.

- Outstanding manual tasks (not automatic):
  - Run the SQL migration `supabase/migrations/20240115_admin_dashboard_tables.sql` in your Supabase project.
  - Add `ADMIN_USER_IDS` environment variable in Vercel (or set `raw_user_meta_data.is_admin = true` for your account in Supabase) to access `/admin`.
  - Verify Paystack webhook wiring to insert into `paystack_events` (integration endpoint to be updated).

If you want, I can now:
- Execute the remaining planned code changes (cron auth, Today page UX) and push them.
- Run the SQL migration for you — I cannot run it in your Supabase account, but I can generate the exact commands and instructions to run.

---
Generated: May 5, 2026
