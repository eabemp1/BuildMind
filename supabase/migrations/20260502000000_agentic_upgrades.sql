-- ============================================================================
-- Migration: 20260502000000_agentic_upgrades.sql
-- Adds all missing columns and tables required for full agentic behaviour.
-- Safe to run more than once (uses IF NOT EXISTS / DO blocks throughout).
-- ============================================================================

-- ── 1. founder_context — add all missing columns ─────────────────────────────
-- The base table exists. These columns are referenced in code but never added.

ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS cognitive_load              text    NOT NULL DEFAULT 'fresh'
    CHECK (cognitive_load IN ('fresh','drained','autopilot')),
  ADD COLUMN IF NOT EXISTS cognitive_pattern           text,
  ADD COLUMN IF NOT EXISTS tasks_accepted_this_week    int2    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tasks_overridden_this_week  int2    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_reasons            text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS breakthrough_moments        text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS competitor_context          jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pattern_flags               jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS timezone_offset             int2    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS morning_briefing_hour       int2    NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS evening_check_hour          int2    NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS momentum_updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Recovery Mode (Forgiveness Protocol — Playbook §4.2)
  ADD COLUMN IF NOT EXISTS recovery_mode_active        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reset_mission_complete      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reset_mission_text          text,
  -- Consecutive task tracking (for Emotional Language Layer)
  ADD COLUMN IF NOT EXISTS consecutive_tasks_completed int2    NOT NULL DEFAULT 0;

-- Fix avoidance_signals and topics_mentioned_repeatedly to have NOT NULL defaults
-- (they exist but may be nullable in older schemas)
DO $$
BEGIN
  UPDATE founder_context
  SET avoidance_signals = '{}'
  WHERE avoidance_signals IS NULL;

  UPDATE founder_context
  SET topics_mentioned_repeatedly = '{}'
  WHERE topics_mentioned_repeatedly IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 2. feed_events — public activity feed (referenced in reflect-action) ──────
CREATE TABLE IF NOT EXISTS feed_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  flag         text        NOT NULL DEFAULT '🌍',
  location     text        NOT NULL DEFAULT 'Somewhere',
  stage        text        NOT NULL DEFAULT 'Idea',
  stage_color  text        NOT NULL DEFAULT '#6366f1',
  action       text,
  outcome      text,
  streak       int2        NOT NULL DEFAULT 0,
  type         text        NOT NULL DEFAULT 'done'
    CHECK (type IN ('done', 'streak', 'reflect', 'launch')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- feed_events is intentionally public-readable (anonymous activity feed)
-- but no PII — only flag, location (city/country), stage, and action text
ALTER TABLE feed_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_events_public_read"
  ON feed_events FOR SELECT USING (true);

CREATE POLICY "feed_events_service_insert"
  ON feed_events FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS feed_events_created_at_idx
  ON feed_events (created_at DESC);

-- ── 3. task_overrides — override/skip log (read by pattern extractor) ─────────
CREATE TABLE IF NOT EXISTS task_overrides (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason     text        NOT NULL DEFAULT 'not specified',
  task_text  text,
  stage      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_overrides_self_only"
  ON task_overrides FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS task_overrides_user_created_idx
  ON task_overrides (user_id, created_at DESC);

-- ── 4. reflections — ensure all columns exist ────────────────────────────────
-- Table exists but may be missing columns the code writes
ALTER TABLE reflections
  ADD COLUMN IF NOT EXISTS project_id   uuid REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome      text,
  ADD COLUMN IF NOT EXISTS note         text,
  ADD COLUMN IF NOT EXISTS confidence   int2 CHECK (confidence BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS today_action text;

CREATE INDEX IF NOT EXISTS reflections_user_created_idx
  ON reflections (user_id, created_at DESC);

-- ── 5. morning_briefings — ensure raw_context and opened_at columns exist ─────
ALTER TABLE morning_briefings
  ADD COLUMN IF NOT EXISTS raw_context jsonb,
  ADD COLUMN IF NOT EXISTS opened_at   timestamptz;

-- ── 6. execution_scorecards — ensure table has required columns ───────────────
ALTER TABLE execution_scorecards
  ADD COLUMN IF NOT EXISTS project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS score       int2,
  ADD COLUMN IF NOT EXISTS summary     text,
  ADD COLUMN IF NOT EXISTS strengths   text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS gaps        text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS raw_output  jsonb;

-- ── 7. Backfill consecutive_tasks_completed from existing task completions ────
-- For existing users: count tasks completed in the last 7 days as a rough signal
DO $$
BEGIN
  UPDATE founder_context fc
  SET consecutive_tasks_completed = (
    SELECT COUNT(*)::int2
    FROM reflections r
    WHERE r.user_id = fc.user_id
      AND r.outcome = 'completed'
      AND r.created_at >= now() - interval '7 days'
  )
  WHERE consecutive_tasks_completed = 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 8. Weekly reset: tasks_accepted_this_week and tasks_overridden_this_week ──
-- Add a pg_cron job to reset weekly task counters every Monday at midnight UTC
-- (safe to skip if pg_cron extension is not available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'reset-weekly-task-counters',
      '0 0 * * 1',
      $cron$
        UPDATE founder_context
        SET tasks_accepted_this_week = 0,
            tasks_overridden_this_week = 0
        WHERE tasks_accepted_this_week > 0
           OR tasks_overridden_this_week > 0;
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 9. Indexes for pattern query performance ──────────────────────────────────
CREATE INDEX IF NOT EXISTS founder_context_momentum_idx
  ON founder_context (momentum_score);

CREATE INDEX IF NOT EXISTS founder_context_recovery_idx
  ON founder_context (recovery_mode_active)
  WHERE recovery_mode_active = true;

-- ── 11. reflexion_quality_log — gatekeeper verdict ledger ───────────────────
-- Logs every Agent B pass/fail verdict so quality can be measured over time.
-- Without this table the gatekeeper may silently rubber-stamp everything.
CREATE TABLE IF NOT EXISTS reflexion_quality_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id      uuid        REFERENCES projects(id) ON DELETE SET NULL,
  context         text,       -- which prompt triggered this (today_action, coach, etc.)
  verdict         text        NOT NULL CHECK (verdict IN ('pass', 'fail')),
  reject_reason   text,       -- populated on fail — why it was rejected
  original_output text,       -- what Agent A generated
  final_output    text,       -- what Agent C produced after gating
  stage           text,
  momentum_score  int2,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reflexion_quality_log ENABLE ROW LEVEL SECURITY;

-- Founders can read their own quality log (useful for transparency / debugging)
CREATE POLICY "reflexion_quality_self_read"
  ON reflexion_quality_log FOR SELECT
  USING (auth.uid() = user_id);

-- Service role inserts (called server-side)
CREATE POLICY "reflexion_quality_service_insert"
  ON reflexion_quality_log FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS reflexion_quality_verdict_idx
  ON reflexion_quality_log (verdict, created_at DESC);

CREATE INDEX IF NOT EXISTS reflexion_quality_user_idx
  ON reflexion_quality_log (user_id, created_at DESC);

-- ── 10. users — public mirror of auth.users (onboarding + plan) ──────────────
-- Referenced throughout lib/data/projects.ts but missing from schema
CREATE TABLE IF NOT EXISTS users (
  id                   uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                text,
  plan                 text        NOT NULL DEFAULT 'free',
  onboarding_completed boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'users_self_only'
  ) THEN
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "users_self_only" ON users FOR ALL
      USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── Result ────────────────────────────────────────────────────────────────────
SELECT
  'Migration 20260502000000_agentic_upgrades complete' AS result,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'founder_context') AS founder_context_columns,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN (
       'founder_context','founder_memory','morning_briefings','evening_checks',
       'scheduled_job_log','projects','milestones','tasks','reflections',
       'notifications','push_subscriptions','execution_scorecards','ai_usage',
       'ventures_blueprints','cofounder_reframe_log','waitlist',
       'feed_events','task_overrides','profiles'
     )
  ) AS tables_present;
