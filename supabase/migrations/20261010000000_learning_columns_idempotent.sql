-- Columns the application writes but no earlier migration defines.
-- Production already has them; this makes fresh/staging environments match.
-- Safe to re-run (IF NOT EXISTS everywhere).

alter table public.reflexion_learning_log
  add column if not exists prediction_source text,
  add column if not exists candidate_id text,
  add column if not exists was_hard_fallback boolean,
  add column if not exists was_hard_fallback_reasons jsonb,
  add column if not exists project_id uuid;

alter table public.reflections
  add column if not exists task_id uuid,
  add column if not exists blocker_category text;

create index if not exists reflexion_learning_log_user_source_idx
  on public.reflexion_learning_log (user_id, prediction_source, created_at desc);
