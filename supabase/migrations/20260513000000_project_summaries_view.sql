-- Migration: 20260513000000_project_summaries_view.sql
--
-- Creates the project_summaries view required by app/reflect/page.tsx.
-- Without this view the Reflect page throws a Supabase error on load and
-- startup_stage always falls back to "Idea" for every founder regardless
-- of their actual stage.
--
-- The view exposes a safe, RLS-compatible read surface over the projects
-- table. auth.uid() is evaluated at query time so each user only sees
-- their own rows — no additional RLS policy is needed on the view itself
-- because Supabase evaluates the security_invoker at the underlying table.

CREATE OR REPLACE VIEW project_summaries
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  COALESCE(name, title, 'Untitled project')  AS name,
  COALESCE(title, name, 'Untitled project')  AS title,
  COALESCE(startup_stage, 'Idea')            AS startup_stage,
  COALESCE(momentum_score, 50)               AS momentum_score,
  COALESCE(validation_score, 0)              AS validation_score,
  COALESCE(execution_score, 0)               AS execution_score,
  COALESCE(streak, 0)                        AS streak,
  status,
  target_users,
  problem,
  description,
  updated_at,
  created_at
FROM projects
WHERE auth.uid() = user_id
  AND COALESCE(status, 'active') != 'archived';

COMMENT ON VIEW project_summaries IS
  'Safe read-only summary of each founder''s projects. Used by Reflect page '
  'and any route that needs startup_stage without loading the full projects row. '
  'security_invoker=true means RLS on projects is fully enforced.';
