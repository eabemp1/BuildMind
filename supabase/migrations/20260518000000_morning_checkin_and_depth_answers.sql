-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260518000000_morning_checkin_and_depth_answers.sql
--
-- Changes:
--   1. founder_memory.last_morning_note     TEXT   — latest morning check-in note
--   2. founder_memory.last_morning_checkin  DATE   — date of last morning check-in
--   3. projects.target_users               TEXT   — populated by depth-screen answer #3
--
-- All columns use IF NOT EXISTS / DO $$ / EXCEPTION guards to be idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add last_morning_note to founder_memory
DO $$ BEGIN
  ALTER TABLE founder_memory ADD COLUMN last_morning_note     TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE founder_memory ADD COLUMN last_morning_checkin  DATE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 2. Add target_users to projects (depth-screen answer #3)
DO $$ BEGIN
  ALTER TABLE projects ADD COLUMN target_users  TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Comment
COMMENT ON COLUMN founder_memory.last_morning_note    IS 'Most recent morning check-in note from MobileCheckin component';
COMMENT ON COLUMN founder_memory.last_morning_checkin IS 'Date (YYYY-MM-DD) of last morning check-in, used to gate the check-in widget on /today';
COMMENT ON COLUMN projects.target_users               IS 'Target user description — populated from onboarding depth screen Q3 and editable in settings';
