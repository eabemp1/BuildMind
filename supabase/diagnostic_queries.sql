-- Diagnostic script for common failure modes:
--  - Who is hitting AI usage limits (top consumers)
--  - Tasks/milestones creation gaps
--  - Projects that cannot be deleted due to constraints
--  - Recent scheduled job failures
-- Run this in Supabase SQL editor (service role) to avoid RLS hiding rows.

-- 1) Top AI consumers (last 30 days)
SELECT
  u.id AS user_id,
  u.email,
  (u.raw_user_meta_data->>'plan') AS plan,
  COUNT(a.*) FILTER (WHERE a.created_at >= now() - interval '30 days') AS calls_last_30d,
  COALESCE(SUM(a.input_tokens) FILTER (WHERE a.created_at >= now() - interval '30 days'),0) AS input_tokens_30d,
  COALESCE(SUM(a.output_tokens) FILTER (WHERE a.created_at >= now() - interval '30 days'),0) AS output_tokens_30d,
  COALESCE(SUM(a.cost_usd) FILTER (WHERE a.created_at >= now() - interval '30 days'),0) AS cost_usd_30d
FROM auth.users u
LEFT JOIN ai_usage a ON a.user_id = u.id
GROUP BY u.id, u.email, u.raw_user_meta_data
ORDER BY calls_last_30d DESC NULLS LAST
LIMIT 100;

-- 2) Aggregate AI usage by month (most recent months)
SELECT
  u.id AS user_id,
  u.email,
  date_trunc('month', a.created_at) AS month,
  COUNT(*) AS calls,
  SUM(a.input_tokens) AS input_tokens,
  SUM(a.output_tokens) AS output_tokens,
  SUM(a.cost_usd) AS cost_usd
FROM ai_usage a
JOIN auth.users u ON u.id = a.user_id
GROUP BY u.id, u.email, date_trunc('month', a.created_at)
ORDER BY month DESC, calls DESC
LIMIT 200;

-- 3) founder_context snapshot (task counters & last seen)
SELECT
  fc.user_id,
  u.email,
  COALESCE(fc.tasks_generated,0) AS tasks_generated,
  COALESCE(fc.tasks_completed,0) AS tasks_completed,
  -- `xp` and `streak` may not exist in older schemas; use NULL placeholders if absent
  NULL::int AS xp,
  NULL::int AS streak,
  fc.updated_at AS last_seen
FROM founder_context fc
LEFT JOIN auth.users u ON u.id = fc.user_id
ORDER BY fc.tasks_generated DESC NULLS LAST
LIMIT 200;

-- 4) Projects with no milestones (why milestones not created)
SELECT p.id AS project_id, p.name AS project_name, p.user_id, u.email, p.created_at
FROM projects p
LEFT JOIN milestones m ON m.project_id = p.id
LEFT JOIN auth.users u ON u.id = p.user_id
WHERE m.id IS NULL
ORDER BY p.created_at DESC
LIMIT 200;

-- 5) Milestones that exist but have zero tasks
SELECT m.id AS milestone_id, m.project_id, m.title, m.user_id, u.email, m.created_at
FROM milestones m
LEFT JOIN tasks t ON t.milestone_id = m.id
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE t.id IS NULL
ORDER BY m.created_at DESC
LIMIT 200;

-- 6) Projects with many milestones (distribution)
SELECT p.id AS project_id, p.name AS project_name, COUNT(m.*) AS milestone_count
FROM projects p
LEFT JOIN milestones m ON m.project_id = p.id
GROUP BY p.id, p.name
ORDER BY milestone_count DESC
LIMIT 200;

-- 7) Recent scheduled job failures (cron / background jobs)
SELECT id, job_name, user_id, status, detail, created_at
FROM scheduled_job_log
WHERE status = 'error' OR created_at >= now() - interval '7 days'
ORDER BY created_at DESC
LIMIT 200;

-- 8) Check RLS status for key tables and policies (projects, milestones, tasks, founder_context)
SELECT c.relname AS table_name, c.relrowsecurity AS row_level_security
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('projects','milestones','tasks','founder_context');

SELECT schemaname, tablename, policyname, permissive, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('projects','milestones','tasks','founder_context')
ORDER BY tablename, policyname;

-- 9) Foreign-key constraints referencing projects (deletion failures)
SELECT
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS definition,
  rel1.relname AS table_with_constraint,
  rel2.relname AS referenced_table
FROM pg_constraint con
JOIN pg_class rel1 ON con.conrelid = rel1.oid
JOIN pg_class rel2 ON con.confrelid = rel2.oid
WHERE rel2.relname = 'projects' OR rel1.relname = 'projects';

-- 10) Quick counts summary (helpful snapshot)
SELECT
  (SELECT COUNT(*) FROM auth.users) AS users_count,
  (SELECT COUNT(*) FROM projects) AS projects_count,
  (SELECT COUNT(*) FROM milestones) AS milestones_count,
  (SELECT COUNT(*) FROM tasks) AS tasks_count,
  (SELECT COUNT(*) FROM ai_usage WHERE created_at >= now()-interval '30 days') AS ai_usage_30d_count;

-- End of script
