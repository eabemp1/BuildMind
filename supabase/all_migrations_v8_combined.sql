-- BuildMind v8 combined migration
-- Generated from supabase/migrations in filename order.
-- Run once in the Supabase SQL editor, or prefer Supabase CLI migrations when available.


-- ============================================================================
-- Source: 20240115_admin_dashboard_tables.sql
-- ============================================================================

-- Migration: Admin Dashboard Tables
-- Created: 2024-01-01
-- Purpose: Support admin dashboard Phase 1 components

-- ============================================================================
-- TABLE: paystack_events (webhook event log)
-- ============================================================================
create table if not exists paystack_events (
  id            bigserial primary key,
  event         text not null,
  customer_email text,
  amount        bigint,          -- in kobo/cents
  status        text default 'pending',
  reference     text,
  raw_payload   jsonb,
  received_at   timestamptz default now()
);

create index if not exists idx_paystack_events_received on paystack_events(received_at desc);
create index if not exists idx_paystack_events_event on paystack_events(event);
create index if not exists idx_paystack_events_status on paystack_events(status);

-- ============================================================================
-- TABLE: onboarding_events (funnel aggregation)
-- ============================================================================
create table if not exists onboarding_events (
  step       text primary key,
  count      bigint default 0,
  updated_at timestamptz default now()
);

-- ============================================================================
-- TABLE: briefing_opens (morning briefing tracking)
-- ============================================================================
create table if not exists briefing_opens (
  id        bigserial primary key,
  user_id   uuid references auth.users(id) on delete cascade,
  opened_at timestamptz default now()
);

create index if not exists idx_briefing_opens_user on briefing_opens(user_id, opened_at desc);
create index if not exists idx_briefing_opens_opened on briefing_opens(opened_at desc);

-- ============================================================================
-- FUNCTION: increment_funnel_step (upsert helper)
-- ============================================================================
create or replace function increment_funnel_step(p_step text)
returns void language plpgsql as $$
begin
  insert into onboarding_events (step, count, updated_at)
  values (p_step, 1, now())
  on conflict (step) do update
    set count = onboarding_events.count + 1,
        updated_at = now();
end;
$$;

-- ============================================================================
-- ALTER: founder_context (add task counters if missing)
-- ============================================================================
alter table if exists founder_context
  add column if not exists tasks_completed integer default 0,
  add column if not exists tasks_generated integer default 0;


-- ============================================================================
-- Source: 20250505_add_ai_usage_policies.sql
-- ============================================================================

-- Migration: Add INSERT policy to ai_usage table
-- Fixes: AI usage tracking not working (ai_usage_30d_count = 0 in stats)

DROP POLICY IF EXISTS ai_usage_insert_own ON ai_usage;

CREATE POLICY ai_usage_insert_own ON ai_usage
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Also add UPDATE policy in case we need to update rows
DROP POLICY IF EXISTS ai_usage_update_own ON ai_usage;
CREATE POLICY ai_usage_update_own ON ai_usage
  FOR UPDATE
  USING (auth.uid() = user_id);



-- ============================================================================
-- Source: 20250505_add_delete_policies.sql
-- ============================================================================

-- Migration: Add missing DELETE RLS policies
-- Fixes: projects cannot be deleted due to missing DELETE policy

-- Add DELETE policy for projects
DROP POLICY IF EXISTS projects_delete_own ON projects;
CREATE POLICY projects_delete_own ON projects
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add DELETE policy for milestones
DROP POLICY IF EXISTS milestones_delete_own ON milestones;
CREATE POLICY milestones_delete_own ON milestones
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add DELETE policy for tasks
DROP POLICY IF EXISTS tasks_delete_own ON tasks;
CREATE POLICY tasks_delete_own ON tasks
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add DELETE policy for founder_context (if needed for resets)
DROP POLICY IF EXISTS founder_context_delete_own ON founder_context;
CREATE POLICY founder_context_delete_own ON founder_context
  FOR DELETE
  USING (auth.uid() = user_id);



-- ============================================================================
-- Source: 20260419203000_founder_memory.sql
-- ============================================================================

-- Migration: founder_memory table
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS founder_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  personality_tags text[] NOT NULL DEFAULT '{}',
  decision_patterns jsonb NOT NULL DEFAULT '[]',
  emotional_signals jsonb NOT NULL DEFAULT '[]',
  avoidance_zones text[] NOT NULL DEFAULT '{}',
  strengths text[] NOT NULL DEFAULT '{}',
  cofounder_style text NOT NULL DEFAULT 'execution-coach'
    CHECK (cofounder_style IN ('direct-challenger', 'strategic-partner', 'execution-coach', 'devil-advocate')),
  last_insight text,
  insight_history jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- RLS: users can only see their own memory
ALTER TABLE founder_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own memory" ON founder_memory;

CREATE POLICY "Users can read own memory"
  ON founder_memory FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert own memory" ON founder_memory;

CREATE POLICY "Users can upsert own memory"
  ON founder_memory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own memory" ON founder_memory;

CREATE POLICY "Users can update own memory"
  ON founder_memory FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS founder_memory_user_id_idx ON founder_memory (user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_founder_memory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS founder_memory_updated_at ON founder_memory;

CREATE TRIGGER founder_memory_updated_at
  BEFORE UPDATE ON founder_memory
  FOR EACH ROW EXECUTE FUNCTION update_founder_memory_timestamp();




-- ============================================================================
-- Source: 20260425000000_cofounder_core_and_ventures.sql
-- ============================================================================

-- Migration: 20260425000000_cofounder_core_and_ventures.sql
-- Adds CoFounder Core fields to founder_memory and creates ventures_blueprints table.

-- ── 1. Extend founder_memory with CoFounder Core fields ─────────────────────

ALTER TABLE founder_memory
  ADD COLUMN IF NOT EXISTS validation_receipts  jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS competitor_history   jsonb DEFAULT '[]'::jsonb NOT NULL;

COMMENT ON COLUMN founder_memory.validation_receipts IS
  'Array of ValidationReceipt objects — real human responses that confirm the problem is real. Surfaced during competitor spirals.';

COMMENT ON COLUMN founder_memory.competitor_history IS
  'Array of CompetitorHistoryEntry objects — tracks which competitors the founder has looked up and how often, used to detect avoidance patterns.';

-- ── 2. Create ventures_blueprints table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS ventures_blueprints (
  id                  text        PRIMARY KEY,
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  input_type          text        NOT NULL DEFAULT 'text',
  intent_summary      text        NOT NULL DEFAULT '',
  problem_statement   text        NOT NULL DEFAULT '',
  blueprint_json      jsonb,        -- full blueprint stored for history / export
  startup_score       int2,         -- feasibility score 0-100
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- RLS: users can only see their own blueprints
ALTER TABLE ventures_blueprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ventures_blueprints_self_only" ON ventures_blueprints;

CREATE POLICY "ventures_blueprints_self_only"
  ON ventures_blueprints
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ventures_blueprints_user_created
  ON ventures_blueprints (user_id, created_at DESC);

COMMENT ON TABLE ventures_blueprints IS
  'Stores generated startup blueprints from BuildMind Ventures. One row per generation event.';

-- ── 3. Create cofounder_reframe_log table (rate limiting + analytics) ────────

CREATE TABLE IF NOT EXISTS cofounder_reframe_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competitor_name text        NOT NULL,
  competitor_url  text,
  week_key        text        NOT NULL,  -- "YYYY-Www" ISO week format
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cofounder_reframe_log
  ADD COLUMN IF NOT EXISTS user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS competitor_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS competitor_url  text,
  ADD COLUMN IF NOT EXISTS week_key        text NOT NULL DEFAULT to_char(now(), 'IYYY-"W"IW'),
  ADD COLUMN IF NOT EXISTS created_at      timestamptz NOT NULL DEFAULT now();

ALTER TABLE cofounder_reframe_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reframe_log_self_only" ON cofounder_reframe_log;

CREATE POLICY "reframe_log_self_only"
  ON cofounder_reframe_log
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS reframe_log_user_week
  ON cofounder_reframe_log (user_id, week_key);

COMMENT ON TABLE cofounder_reframe_log IS
  'Tracks Competitor Reframe usage per user per week for plan gating (3/week free, unlimited builder).';

-- ── 4. Trigger: auto-update ventures_blueprints.updated_at ──────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'ventures_blueprints_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS ventures_blueprints_updated_at ON ventures_blueprints;
    CREATE TRIGGER ventures_blueprints_updated_at
      BEFORE UPDATE ON ventures_blueprints
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;




-- ============================================================================
-- Source: 20260426000000_founder_context_and_momentum.sql
-- ============================================================================

-- Migration: 20260426000000_founder_context_and_momentum.sql
-- Adds the Founder Context Object (agentic memory), momentum_score column,
-- and scheduled job audit log.

-- ── 1. founder_context table — the brain behind everything ──────────────────
-- This is the Founder Context Object described in Playbook Section 3.1.
-- Updated after every meaningful interaction. Feeds into every Reflexion loop call.

CREATE TABLE IF NOT EXISTS founder_context (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core identity
  startup_summary             text,
  current_stage               text        NOT NULL DEFAULT 'Idea',

  -- Momentum
  momentum_score              int2        NOT NULL DEFAULT 50
                                          CHECK (momentum_score BETWEEN 0 AND 100),
  momentum_updated_at         timestamptz NOT NULL DEFAULT now(),
  last_active                 date        NOT NULL DEFAULT CURRENT_DATE,
  days_inactive               int2        NOT NULL DEFAULT 0,

  -- Task behaviour
  tasks_accepted_this_week    int2        NOT NULL DEFAULT 0,
  tasks_overridden_this_week  int2        NOT NULL DEFAULT 0,
  override_reasons            text[]      NOT NULL DEFAULT '{}',
  topics_mentioned_repeatedly text[]      NOT NULL DEFAULT '{}',

  -- Cognitive state
  cognitive_load              text        NOT NULL DEFAULT 'fresh'
                                          CHECK (cognitive_load IN ('fresh','drained','autopilot')),
  cognitive_pattern           text,       -- e.g. "drained Mondays, fresh Thursdays"

  -- Agentic signals
  avoidance_signals           text[]      NOT NULL DEFAULT '{}',
  breakthrough_moments        text[]      NOT NULL DEFAULT '{}',
  competitor_context          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  pattern_flags               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- {avoidance: bool, override_clustering: bool, momentum_decay: bool, topic_repetition: bool}

  -- Scheduling
  timezone_offset             int2        NOT NULL DEFAULT 0, -- UTC offset in hours
  morning_briefing_hour       int2        NOT NULL DEFAULT 7,
  evening_check_hour          int2        NOT NULL DEFAULT 18,

  -- Meta
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id)
);

ALTER TABLE founder_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "founder_context_self_only" ON founder_context;

CREATE POLICY "founder_context_self_only"
  ON founder_context FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS founder_context_user_id_idx ON founder_context (user_id);
CREATE INDEX IF NOT EXISTS founder_context_last_active_idx ON founder_context (last_active);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_founder_context_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS founder_context_updated_at ON founder_context;

CREATE TRIGGER founder_context_updated_at
  BEFORE UPDATE ON founder_context
  FOR EACH ROW EXECUTE FUNCTION update_founder_context_timestamp();

COMMENT ON TABLE founder_context IS
  'Founder Context Object — the structured agentic profile described in BuildMind Playbook Section 3.1.
   Updated after every interaction. Passed into every Reflexion loop call.
   This is the moat: accumulated context that makes AI responses feel like they actually know the founder.';


-- ── 2. morning_briefings table — stores generated briefings ─────────────────
CREATE TABLE IF NOT EXISTS morning_briefings (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  win           text        NOT NULL,    -- Win from yesterday
  risk          text        NOT NULL,    -- Risk today
  action        text        NOT NULL,    -- One action right now
  raw_context   jsonb,                   -- Snapshot of founder_context used to generate
  delivered_at  timestamptz,
  opened_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE morning_briefings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "briefings_self_only" ON morning_briefings;
CREATE POLICY "briefings_self_only" ON morning_briefings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS morning_briefings_user_created
  ON morning_briefings (user_id, created_at DESC);


-- ── 3. evening_checks table — stores evening nudge results ──────────────────
CREATE TABLE IF NOT EXISTS evening_checks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_completed  boolean   NOT NULL DEFAULT false,
  nudge_sent    boolean     NOT NULL DEFAULT false,
  nudge_text    text,
  momentum_before int2,
  momentum_after  int2,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE evening_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "evening_checks_self_only" ON evening_checks;
CREATE POLICY "evening_checks_self_only" ON evening_checks FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── 4. scheduled_job_log — audit trail for all 3 scheduled jobs ─────────────
CREATE TABLE IF NOT EXISTS scheduled_job_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name    text        NOT NULL,  -- 'morning_briefing' | 'evening_check' | 'weekly_mirror'
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status      text        NOT NULL,  -- 'success' | 'skipped' | 'error'
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Only service role can write to this
ALTER TABLE scheduled_job_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scheduled_job_log_service_only" ON scheduled_job_log;
CREATE POLICY "scheduled_job_log_service_only"
  ON scheduled_job_log FOR ALL USING (false);


-- ── 5. Add momentum_score to projects table (convenience column) ─────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'momentum_score'
  ) THEN
    ALTER TABLE projects ADD COLUMN momentum_score int2 NOT NULL DEFAULT 50
      CHECK (momentum_score BETWEEN 0 AND 100);
  END IF;
END $$;

-- ── 6. Add cognitive_load to users table (last known state) ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'cognitive_load'
  ) THEN
    ALTER TABLE users ADD COLUMN cognitive_load text DEFAULT 'fresh';
  END IF;
END $$;




-- ============================================================================
-- Source: 20260429000000_admin_role.sql
-- ============================================================================

-- Migration: 20260429000000_admin_role.sql
-- Replaces NEXT_PUBLIC_ADMIN_USER_ID env-var pattern with a server-side
-- is_admin column on profiles. Grants cannot be spoofed from the client.

-- 1. Add is_admin column (default false — no one is an admin until explicitly set)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 2. RLS: only the user themselves can read their own row (already enforced).
--    The is_admin column is only evaluated server-side via the service-role key.

-- 3. One-time bootstrap: if NEXT_PUBLIC_ADMIN_USER_ID was set, promote that user.
--    Run this manually after applying the migration:
--
--    UPDATE profiles SET is_admin = true WHERE id = '<your-admin-uuid>';
--
--    After confirming the owner panel works, remove NEXT_PUBLIC_ADMIN_USER_ID
--    from all environment configs.

COMMENT ON COLUMN profiles.is_admin IS
  'Server-side admin flag. Evaluated via service-role key only — never exposed to the client.';


-- ============================================================================
-- Source: 20260430000000_align_app_schema.sql
-- ============================================================================

-- Align live Supabase tables with the current BuildMind frontend/API schema.
-- Safe to run more than once.

create extension if not exists pgcrypto;

alter table if exists projects
  add column if not exists title text,
  add column if not exists name text,
  add column if not exists industry text,
  add column if not exists target_market text,
  add column if not exists problem_type text,
  add column if not exists revenue_model text,
  add column if not exists startup_stage text default 'Idea',
  add column if not exists target_users text,
  add column if not exists problem text,
  add column if not exists validation_score int,
  add column if not exists execution_score int,
  add column if not exists momentum_score int default 50,
  add column if not exists validation_strengths text[] default '{}',
  add column if not exists validation_weaknesses text[] default '{}',
  add column if not exists validation_suggestions text[] default '{}',
  add column if not exists domain text,
  add column if not exists score int,
  add column if not exists streak int default 0,
  add column if not exists updated_at timestamptz default now();

update projects
set
  title = coalesce(title, name, 'Untitled project'),
  name = coalesce(name, title, 'Untitled project'),
  startup_stage = coalesce(startup_stage, 'Idea'),
  validation_strengths = coalesce(validation_strengths, '{}'),
  validation_weaknesses = coalesce(validation_weaknesses, '{}'),
  validation_suggestions = coalesce(validation_suggestions, '{}'),
  momentum_score = coalesce(momentum_score, 50),
  streak = coalesce(streak, 0)
where title is null
   or name is null
   or startup_stage is null
   or validation_strengths is null
   or validation_weaknesses is null
   or validation_suggestions is null
   or momentum_score is null
   or streak is null;

alter table if exists milestones
  add column if not exists user_id uuid,
  add column if not exists title text,
  add column if not exists stage text,
  add column if not exists order_index int default 0,
  add column if not exists is_completed boolean default false,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz default now();

update milestones m
set user_id = p.user_id
from projects p
where m.project_id = p.id
  and m.user_id is null;

update milestones
set
  title = coalesce(title, stage, status, 'Milestone'),
  stage = coalesce(stage, title, status, 'Milestone'),
  order_index = coalesce(order_index, 0),
  is_completed = coalesce(is_completed, status = 'completed'),
  completed_at = case
    when coalesce(is_completed, false) and completed_at is null then updated_at
    else completed_at
  end
where title is null
   or stage is null
   or order_index is null
   or is_completed is null;

alter table if exists tasks
  add column if not exists user_id uuid,
  add column if not exists title text,
  add column if not exists notes text,
  add column if not exists is_completed boolean default false,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz default now();

update tasks t
set user_id = m.user_id
from milestones m
where t.milestone_id = m.id
  and t.user_id is null;

update tasks
set
  title = coalesce(title, description, 'Task'),
  is_completed = coalesce(is_completed, status = 'completed'),
  completed_at = case
    when coalesce(is_completed, false) and completed_at is null then updated_at
    else completed_at
  end
where title is null
   or is_completed is null;

alter table if exists ai_usage
  add column if not exists month text,
  add column if not exists count int default 0;

create table if not exists push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz default now(),
  unique(user_id)
);

delete from push_subscriptions a
using push_subscriptions b
where a.user_id = b.user_id
  and a.created_at < b.created_at;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'push_subscriptions_user_id_key'
  ) then
    alter table push_subscriptions
      add constraint push_subscriptions_user_id_key unique (user_id);
  end if;
end $$;

alter table push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'Users manage own subscription'
  ) then
    DROP POLICY IF EXISTS "Users manage own subscription" ON push_subscriptions;
    create policy "Users manage own subscription"
      on push_subscriptions
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists projects_user_created_idx on projects (user_id, created_at desc);
create index if not exists milestones_project_order_idx on milestones (project_id, order_index);
create index if not exists tasks_milestone_created_idx on tasks (milestone_id, created_at);



-- ============================================================================
-- Source: 20260502000000_agentic_upgrades.sql
-- ============================================================================

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

DROP POLICY IF EXISTS "feed_events_public_read" ON feed_events;

CREATE POLICY "feed_events_public_read"
  ON feed_events FOR SELECT USING (true);

DROP POLICY IF EXISTS "feed_events_service_insert" ON feed_events;

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

DROP POLICY IF EXISTS "task_overrides_self_only" ON task_overrides;

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
DROP POLICY IF EXISTS "reflexion_quality_self_read" ON reflexion_quality_log;
CREATE POLICY "reflexion_quality_self_read"
  ON reflexion_quality_log FOR SELECT
  USING (auth.uid() = user_id);

-- Service role inserts (called server-side)
DROP POLICY IF EXISTS "reflexion_quality_service_insert" ON reflexion_quality_log;
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
    DROP POLICY IF EXISTS "users_self_only" ON users;
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



-- ============================================================================
-- Source: 20260503000000_atomic_ai_usage_rpcs.sql
-- ============================================================================

-- Migration: 20260503000000_atomic_ai_usage_rpcs.sql
--
-- Adds two Postgres RPCs that atomically increment the ai_usage counter,
-- replacing the SELECT + UPDATE pattern that had a race condition.
--
-- Why this matters:
--   The old code read the count, checked it, then wrote it back — two
--   separate round-trips. Two concurrent tab requests could both read the
--   same count (e.g. 29) and both conclude they're under the 30-call limit,
--   effectively allowing 31+ calls. The RPC fixes this with a single
--   atomic UPDATE ... RETURNING that Postgres serialises safely.
--
-- increment_ai_usage(p_user_id, p_month)
--   Upserts a row and increments count. No cap. Returns new count.
--   Used for Builder/Venture unlimited plans (just tracking).
--
-- increment_ai_usage_capped(p_user_id, p_month, p_limit)
--   Atomically increments ONLY if current count < p_limit.
--   Returns the new count on success, or -1 if the cap is already reached.
--   Used for Free plan enforcement.

-- ── Uncapped increment (unlimited plans) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_user_id uuid,
  p_month   text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count integer;
BEGIN
  INSERT INTO ai_usage (user_id, month, count)
    VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month)
    DO UPDATE SET count = ai_usage.count + 1
  RETURNING count INTO v_new_count;

  RETURN v_new_count;
END;
$$;

-- ── Capped increment (free plan) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_ai_usage_capped(
  p_user_id uuid,
  p_month   text,
  p_limit   integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current integer := 0;
  v_new_count integer;
BEGIN
  -- Ensure a row exists so we can lock it.
  INSERT INTO ai_usage (user_id, month, count)
    VALUES (p_user_id, p_month, 0)
  ON CONFLICT (user_id, month) DO NOTHING;

  -- Read current count with a row-level lock so concurrent calls queue up
  -- behind each other rather than racing.
  SELECT count INTO v_current
    FROM ai_usage
   WHERE user_id = p_user_id AND month = p_month
     FOR UPDATE;

  -- If already at or over the limit, return the sentinel value -1.
  IF v_current >= p_limit THEN
    RETURN -1;
  END IF;

  -- Safe to increment.
  UPDATE ai_usage
     SET count = count + 1
   WHERE user_id = p_user_id AND month = p_month
  RETURNING count INTO v_new_count;

  RETURN v_new_count;
END;
$$;

-- Grant execute to the service role used by createAdminClient().
GRANT EXECUTE ON FUNCTION increment_ai_usage(uuid, text)          TO service_role;
GRANT EXECUTE ON FUNCTION increment_ai_usage_capped(uuid, text, integer) TO service_role;

-- Ensure the unique constraint exists so ON CONFLICT works correctly.
-- (It should already exist from prior migrations, but this is idempotent.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ai_usage_user_id_month_key'
  ) THEN
    ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_user_id_month_key UNIQUE (user_id, month);
  END IF;
END;
$$;


-- ============================================================================
-- Source: 20260504000000_venture_tracks.sql
-- ============================================================================

-- Migration: 20260504000000_venture_tracks.sql
--
-- Adds the venture_tracks table so that roadmap track progress (decisions
-- marked done, track creation/deletion) is persisted server-side instead of
-- only in localStorage. This means progress survives new devices, browser
-- clears, and incognito sessions — consistent with how streak, XP, and
-- score history are already handled.
--
-- The localStorage layer is kept as a read-through cache (it still writes
-- locally for instant UI updates) but the server is the source of truth.

CREATE TABLE IF NOT EXISTS venture_tracks (
  id          text          PRIMARY KEY,                -- client-generated UUID
  user_id     uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        jsonb         NOT NULL DEFAULT '{}'::jsonb,  -- full UserTrack JSON
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

-- RLS: each user can only access their own tracks
ALTER TABLE venture_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venture_tracks_self_only" ON venture_tracks;

CREATE POLICY "venture_tracks_self_only"
  ON venture_tracks
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS venture_tracks_user_updated
  ON venture_tracks (user_id, updated_at DESC);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'venture_tracks_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS venture_tracks_updated_at ON venture_tracks;
    CREATE TRIGGER venture_tracks_updated_at
      BEFORE UPDATE ON venture_tracks
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- Also add blueprint_first_used flag to founder_context so the "free preview
-- used" gate survives across devices (was previously localStorage-only).
ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS blueprint_first_used boolean NOT NULL DEFAULT false;

COMMENT ON TABLE venture_tracks IS
  'Stores user roadmap track progress server-side. Data column holds the full UserTrack JSON including all paths and decision done states.';

COMMENT ON COLUMN venture_tracks.data IS
  'Full UserTrack JSON object. Replaced on every save (last-write-wins, same as the localStorage pattern it replaces).';




-- ============================================================================
-- Source: 20260506000000_usage_avatar_daily_stats.sql
-- ============================================================================

alter table founder_context
add column if not exists tasks_completed_today integer default 0,
add column if not exists last_task_date date,
add column if not exists daily_tasks_reset_at timestamptz,
add column if not exists ai_messages_today integer default 0,
add column if not exists last_ai_date date;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Avatar upload: own file only') then
    DROP POLICY IF EXISTS "Avatar upload: own file only" ON storage.objects;
    create policy "Avatar upload: own file only"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Avatar update: own file only') then
    DROP POLICY IF EXISTS "Avatar update: own file only" ON storage.objects;
    create policy "Avatar update: own file only"
    on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Avatar delete: own file only') then
    DROP POLICY IF EXISTS "Avatar delete: own file only" ON storage.objects;
    create policy "Avatar delete: own file only"
    on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Avatar read: public') then
    DROP POLICY IF EXISTS "Avatar read: public" ON storage.objects;
    create policy "Avatar read: public"
    on storage.objects for select to public
    using (bucket_id = 'avatars');
  end if;
end $$;

create table if not exists ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  call_count integer not null default 0,
  updated_at timestamptz default now(),
  primary key (user_id, month)
);

alter table ai_usage enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_usage' and policyname = 'ai_usage: own rows only') then
    DROP POLICY IF EXISTS "ai_usage: own rows only" ON ai_usage;
    create policy "ai_usage: own rows only" on ai_usage
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;



-- ============================================================================
-- Source: 20260507000000_reflexion_learning_log.sql
-- ============================================================================

-- Migration: 20260507000000_reflexion_learning_log.sql
--
-- Adds the reflexion_learning_log table so the AI can learn from founder
-- behaviour over time — which action types get completed, which get overridden,
-- which pivot angles resonate, and what avoidance patterns emerge.
--
-- This is the feedback memory layer described in the system spec.
-- The learning loop works as follows:
--   1. break-my-startup/route.ts writes a row when it shows an action
--   2. Founder completes or overrides the action → outcome written via
--      /api/ai/reflexion-outcome (new route, see lib/learning.ts)
--   3. lib/learning.ts reads the last 20 rows for this user and derives
--      behavioral patterns (preferred action types, avoided angles, etc.)
--   4. runFullReflexionPipeline() receives those patterns and injects them
--      into the Generator and Refiner prompts
--
-- No external services. No new env vars. Pure Supabase.

-- ─── Main learning log table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reflexion_learning_log (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id          text,                                    -- nullable: idea-only runs have no project
  session_id          text          NOT NULL,                  -- client-generated UUID per analysis run
  stage               text          NOT NULL DEFAULT 'Idea',   -- founder stage at time of analysis

  -- What the AI showed the founder
  action_shown        text          NOT NULL,                  -- the final Stage 7 action text
  action_type         text,                                    -- categorised: 'user_interview' | 'content' | 'outreach' | 'build' | 'research' | 'pivot' | 'pricing' | 'other'
  action_platform     text,                                    -- extracted platform: 'linkedin' | 'whatsapp' | 'twitter' | 'email' | 'reddit' | 'other'
  critic_persona      text,                                    -- which rotating persona was active: 'yc_partner' | 'growth_hacker' | 'accountant' | 'customer_advocate'
  viability_score     integer,                                 -- score at time of this action
  confidence          numeric(4,3),                            -- 0–1 from verifier

  -- Pivot shown (nullable — only when pivot was the primary recommendation)
  pivot_angle         text,                                    -- e.g. 'niche_down' | 'b2b_pivot' | 'services_first'
  pivot_title         text,

  -- What the founder did with it
  outcome             text          CHECK (outcome IN (
                        'completed',    -- founder marked as done
                        'overridden',   -- founder rejected and picked a different task
                        'ignored',      -- founder saw it, did nothing (inferred after 24h)
                        'partial',      -- founder started but did not finish
                        'pending'       -- not yet resolved
                      )) DEFAULT 'pending',
  outcome_note        text,           -- optional: what the founder typed when overriding
  outcome_recorded_at timestamptz,   -- when the outcome was set (null while pending)

  -- Time
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Primary read pattern: fetch last N rows for a user to derive patterns
CREATE INDEX IF NOT EXISTS rll_user_created
  ON reflexion_learning_log (user_id, created_at DESC);

-- Secondary: filter by project for project-specific learning
CREATE INDEX IF NOT EXISTS rll_user_project
  ON reflexion_learning_log (user_id, project_id, created_at DESC);

-- Outcome queries: find overridden/ignored patterns
CREATE INDEX IF NOT EXISTS rll_user_outcome
  ON reflexion_learning_log (user_id, outcome, action_type);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE reflexion_learning_log ENABLE ROW LEVEL SECURITY;

-- Users can only read and write their own rows
DROP POLICY IF EXISTS "rll_select_own" ON reflexion_learning_log;
CREATE POLICY "rll_select_own"
  ON reflexion_learning_log FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "rll_insert_own" ON reflexion_learning_log;

CREATE POLICY "rll_insert_own"
  ON reflexion_learning_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "rll_update_own" ON reflexion_learning_log;

CREATE POLICY "rll_update_own"
  ON reflexion_learning_log FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role bypasses RLS (for API routes using createAdminClient)
-- This is handled automatically by the service role key — no extra policy needed.

-- ─── Auto-update updated_at ───────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'rll_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS rll_updated_at ON reflexion_learning_log;
    CREATE TRIGGER rll_updated_at
      BEFORE UPDATE ON reflexion_learning_log
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

-- ─── Add learned_patterns column to founder_context ──────────────────────────
-- Stores the derived pattern summary so we don't re-derive it on every call.
-- Updated by lib/learning.ts after each outcome is recorded.

ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS learned_patterns jsonb DEFAULT '{}'::jsonb;

ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS last_break_analysis jsonb DEFAULT NULL;

-- ─── Comments ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE reflexion_learning_log IS
  'Records every action shown by the Reflexion pipeline and its outcome. '
  'Used by lib/learning.ts to derive behavioral patterns that improve future recommendations.';

COMMENT ON COLUMN reflexion_learning_log.action_type IS
  'Categorised action type. Derived server-side from action text. '
  'Used to detect which action types this founder completes vs avoids.';

COMMENT ON COLUMN reflexion_learning_log.outcome IS
  'What the founder did with the recommended action. '
  'pending = not yet resolved. ignored = inferred after 24h with no update.';

COMMENT ON COLUMN founder_context.learned_patterns IS
  'Derived behavioral pattern summary. Updated by lib/learning.ts. '
  'Shape: { preferred_action_types, avoided_action_types, avoided_platforms, '
  'override_reasons, pivot_angles_tried, completion_rate, total_logged }';




-- ============================================================================
-- Source: 20260508000000_tasks_completed_total.sql
-- ============================================================================

-- Fix: progressive sidebar unlock counter was localStorage-only.
-- Adding tasks_completed_total to founder_context makes it device-independent.
-- Existing rows get 0 as default. The /api/founder-context/task-complete route
-- increments this on every check-in submission.

ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS tasks_completed_total int4 NOT NULL DEFAULT 0;

COMMENT ON COLUMN founder_context.tasks_completed_total IS
  'Lifetime cumulative task completions — drives progressive sidebar unlock. '
  'Client reads this on load and falls back to localStorage for backwards compat.';


-- ============================================================================
-- Source: 20260510000000_ip_rate_limits.sql
-- ============================================================================

-- Migration: 20260510000000_ip_rate_limits.sql
--
-- Persistent rate limiting table for IP-based limits.
-- Replaces the in-memory Map in lib/server/rateLimit.ts which resets on
-- every cold start and doesn't work across serverless instances.
--
-- Schema: one row per (key, window_start).
-- The key encodes the route + identifier, e.g. "break-public:1.2.3.4".
-- window_start is a unix epoch second, truncated to the window size.
--
-- The RPC rate_limit_check_and_increment atomically:
--   1. Inserts a row if none exists for this (key, window_start)
--   2. Increments the count
--   3. Returns the new count and the limit
-- Returns -1 if the limit is already reached (same sentinel as ai_usage).

CREATE TABLE IF NOT EXISTS ip_rate_limits (
  key          text        NOT NULL,
  window_start bigint      NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- Auto-purge rows older than 2 hours to keep the table small.
-- pg_cron is optional; Vercel cron is the authoritative scheduler in production.
DO $ip_rate_limit_cleanup$
DECLARE jid integer;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO jid
    FROM cron.job
    WHERE jobname = 'purge-ip-rate-limits';

    IF jid IS NOT NULL THEN
      PERFORM cron.unschedule(jid);
    END IF;

    PERFORM cron.schedule(
      'purge-ip-rate-limits',
      '0 * * * *',
      $$DELETE FROM ip_rate_limits WHERE window_start < extract(epoch from now()) - 7200$$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END
$ip_rate_limit_cleanup$;

CREATE OR REPLACE FUNCTION rate_limit_check_and_increment(
  p_key        text,
  p_window_sec integer,  -- window size in seconds, e.g. 3600 for 1 hour
  p_limit      integer
)
RETURNS integer          -- new count, or -1 if limit reached
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_start bigint;
  v_count        integer;
BEGIN
  v_window_start := floor(extract(epoch from now()) / p_window_sec) * p_window_sec;

  INSERT INTO ip_rate_limits (key, window_start, count)
    VALUES (p_key, v_window_start, 0)
  ON CONFLICT (key, window_start) DO NOTHING;

  SELECT count INTO v_count
    FROM ip_rate_limits
   WHERE key = p_key AND window_start = v_window_start
     FOR UPDATE;

  IF v_count >= p_limit THEN
    RETURN -1;
  END IF;

  UPDATE ip_rate_limits
     SET count = count + 1
   WHERE key = p_key AND window_start = v_window_start
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION rate_limit_check_and_increment(text, integer, integer) TO service_role;


-- ============================================================================
-- Source: 20260510100000_admin_bootstrap.sql
-- ============================================================================

-- Migration: 20260510100000_admin_bootstrap.sql
--
-- Bootstraps the first admin user so the admin panel is accessible after a
-- fresh deploy. Without this, is_admin = true must be set manually via the
-- Supabase dashboard before anyone can use the admin routes.
--
-- HOW TO USE:
--   1. Set ADMIN_EMAIL to the email address you registered with.
--   2. Run this file via `supabase db push` or paste into the Supabase SQL editor.
--
-- Re-running this migration is safe — the UPDATE is a no-op if the user is
-- already an admin or the email does not exist.
--
-- To add additional admins later, repeat the UPDATE with the new email, or use:
--   UPDATE public.profiles SET is_admin = true
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'newadmin@example.com');

DO $$
DECLARE
  v_admin_email TEXT := current_setting('app.admin_email', true);
  v_user_id UUID;
BEGIN
  -- Resolve the email to a user ID from auth.users
  IF v_admin_email IS NOT NULL AND v_admin_email <> '' THEN
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = v_admin_email
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
      UPDATE public.profiles
      SET is_admin = true
      WHERE id = v_user_id AND (is_admin IS NULL OR is_admin = false);

      RAISE NOTICE 'Admin bootstrapped for % (user_id: %)', v_admin_email, v_user_id;
    ELSE
      RAISE NOTICE 'Admin bootstrap skipped: no user found with email %', v_admin_email;
    END IF;
  ELSE
    RAISE NOTICE 'Admin bootstrap skipped: app.admin_email not set. '
      'Run: ALTER DATABASE postgres SET app.admin_email = ''you@example.com''; '
      'then re-apply this migration, or set is_admin=true manually in the Supabase dashboard.';
  END IF;
END $$;


-- ============================================================================
-- Source: 20260511000000_performance_indexes.sql
-- ============================================================================

-- Migration: 20260511000000_performance_indexes.sql
--
-- Performance indexes for all tables queried by user_id or project_id.
-- Without these, every SELECT on reflections, tasks, milestones, founder_context,
-- etc. performs a full table scan. Fine at <100 users; painful at 500+.
--
-- All CREATE INDEX calls use IF NOT EXISTS so this migration is safe to re-run.
-- Some tables (morning_briefings, notifications) already had indexes in schema-idempotent.sql;
-- those are omitted here to avoid conflicts.

-- ── projects ─────────────────────────────────────────────────────────────────
-- /today, /overview, /projects — all filter by user_id, often with updated_at ORDER BY
CREATE INDEX IF NOT EXISTS idx_projects_user_id
  ON projects(user_id);

CREATE INDEX IF NOT EXISTS idx_projects_user_updated
  ON projects(user_id, updated_at DESC);

-- ── milestones ────────────────────────────────────────────────────────────────
-- today-action, break-my-startup — filter by project_id, order by created_at
CREATE INDEX IF NOT EXISTS idx_milestones_project_id
  ON milestones(project_id);

CREATE INDEX IF NOT EXISTS idx_milestones_project_created
  ON milestones(project_id, created_at ASC);

-- today-action also filters by user_id directly for some queries
CREATE INDEX IF NOT EXISTS idx_milestones_user_id
  ON milestones(user_id);

-- ── tasks ─────────────────────────────────────────────────────────────────────
-- today-action batches by milestone_id; break-my-startup .in(milestoneIds)
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id
  ON tasks(milestone_id);

-- Partial index: pending tasks only — used by today-action and urgency scoring
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_pending
  ON tasks(milestone_id) WHERE NOT is_completed;

CREATE INDEX IF NOT EXISTS idx_tasks_user_id
  ON tasks(user_id);

-- ── reflections ───────────────────────────────────────────────────────────────
-- today-action — SELECT ... WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
-- This is the most frequently executed query in the whole app (every /today load).
CREATE INDEX IF NOT EXISTS idx_reflections_user_created
  ON reflections(user_id, created_at DESC);

-- reflexion quality log lookups by project
CREATE INDEX IF NOT EXISTS idx_reflections_project_id
  ON reflections(project_id);

-- ── founder_context ───────────────────────────────────────────────────────────
-- morning briefing, evening check, today-action — all look up by user_id
CREATE INDEX IF NOT EXISTS idx_founder_context_user_id
  ON founder_context(user_id);

-- ── founder_memory ────────────────────────────────────────────────────────────
-- today-action parallel fetch — WHERE user_id = ? (maybeSingle)
CREATE INDEX IF NOT EXISTS idx_founder_memory_user_id
  ON founder_memory(user_id);

-- ── ai_usage ─────────────────────────────────────────────────────────────────
-- enforceAndTrackAIUsage — filter by user_id + month
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_month
  ON ai_usage(user_id, month);

-- ── reflexion_learning_log ────────────────────────────────────────────────────
-- lib/learning.ts — SELECT last 20 rows WHERE user_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_reflexion_learning_log_user_created
  ON reflexion_learning_log(user_id, created_at DESC);

-- Partial index: pending rows only — markIgnoredAfter24h queries these
CREATE INDEX IF NOT EXISTS idx_reflexion_learning_log_pending
  ON reflexion_learning_log(user_id, created_at DESC) WHERE outcome = 'pending';

-- ── reflexion_quality_log ────────────────────────────────────────────────────
-- admin/quality page — filter by user_id, project_id, created_at
CREATE INDEX IF NOT EXISTS idx_reflexion_quality_log_user_created
  ON reflexion_quality_log(user_id, created_at DESC);

-- ── push_subscriptions ────────────────────────────────────────────────────────
-- evening-check cron — WHERE user_id = ANY(activeUserIds)
-- schema-idempotent.sql already has the unique endpoint index;
-- add a plain user_id index for the cron batch lookup
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions(user_id);

-- ── notifications ─────────────────────────────────────────────────────────────
-- NotificationBell component — WHERE user_id = ? AND NOT is_read
-- schema-idempotent.sql already has: idx notifications_user_unread WHERE NOT is_read
-- Add a broader user+created index for the full notification list page
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

-- ── ventures_blueprints ───────────────────────────────────────────────────────
-- my-ventures page — WHERE user_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_ventures_blueprints_user_created
  ON ventures_blueprints(user_id, created_at DESC);


-- ============================================================================
-- Source: 20260512000000_pattern_detection_columns.sql
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: pattern_detection_columns
-- Adds the columns required by lib/patternDetection.ts and the task-complete
-- route. Without these columns the pattern detection system writes silently to
-- nowhere and never fires in production.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS active_pattern_signal    text,
  ADD COLUMN IF NOT EXISTS active_pattern_message   text,
  ADD COLUMN IF NOT EXISTS active_pattern_subject   text,
  ADD COLUMN IF NOT EXISTS last_pattern_shown_at    timestamptz,
  ADD COLUMN IF NOT EXISTS momentum_last_week       integer;

-- Index for the cron route — it queries last_pattern_shown_at to avoid
-- repeating patterns within the cooldown window.
CREATE INDEX IF NOT EXISTS idx_founder_context_last_pattern
  ON founder_context (user_id, last_pattern_shown_at);

COMMENT ON COLUMN founder_context.active_pattern_signal    IS 'Most recent pattern signal: avoidance | override_cluster | momentum_decay | topic_repeat';
COMMENT ON COLUMN founder_context.active_pattern_message   IS 'Human-readable pattern message surfaced to the founder';
COMMENT ON COLUMN founder_context.active_pattern_subject   IS 'Category or topic that triggered the pattern';
COMMENT ON COLUMN founder_context.last_pattern_shown_at    IS 'Timestamp of last pattern surface — used to enforce cooldown (24h high / 48h medium)';
COMMENT ON COLUMN founder_context.momentum_last_week       IS 'Momentum score from 7 days ago — used to compute week-over-week decay signal';


-- ============================================================================
-- Source: 20260513_audit_fixes.sql
-- ============================================================================

-- ============================================================================
-- Migration: Audit Fixes — May 2026
-- Fixes the critical schema/TypeScript type misalignment identified in
-- the BuildMind v4 deep audit, and adds the processed_webhooks idempotency
-- table for billing webhook deduplication.
--
-- SAFE TO RUN ON EXISTING DATABASE: uses ALTER TABLE ADD COLUMN IF NOT EXISTS
-- and does not drop any existing columns (legacy columns kept for compatibility).
-- ============================================================================

-- ── 1. Fix founder_memory schema alignment with TypeScript FounderMemory type ──
--
-- Previous schema had: personality_profile jsonb, validation_receipts jsonb[]
-- TypeScript type expects: personality_tags text[], decision_patterns jsonb,
--   emotional_signals jsonb, avoidance_zones text[], strengths text[],
--   cofounder_style text, last_insight text, insight_history jsonb,
--   validationReceipts (camelCase → snake: validation_receipts jsonb),
--   competitorHistory (snake: competitor_history jsonb)
--
-- Any upsert using the TypeScript type against the old schema caused silent
-- data loss because the columns didn't exist.

ALTER TABLE founder_memory
  ADD COLUMN IF NOT EXISTS personality_tags      text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS decision_patterns     jsonb   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS emotional_signals     jsonb   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS avoidance_zones       text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS strengths             text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cofounder_style       text    NOT NULL DEFAULT 'strategic-partner',
  ADD COLUMN IF NOT EXISTS last_insight          text,
  ADD COLUMN IF NOT EXISTS insight_history       jsonb   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS competitor_history    jsonb   NOT NULL DEFAULT '[]';

-- Migrate old personality_profile data into new columns where possible.
-- personality_profile was a freeform jsonb in older databases; fresh v8 schemas
-- do not have it, so guard this block before referencing the legacy column.
DO $personality_profile_migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'founder_memory'
      AND column_name = 'personality_profile'
  ) THEN
    EXECUTE $sql$
      UPDATE founder_memory
      SET
        personality_tags  = COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(personality_profile->'personality_tags')),
          personality_tags
        ),
        avoidance_zones   = COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(personality_profile->'avoidance_zones')),
          avoidance_zones
        ),
        strengths         = COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(personality_profile->'strengths')),
          strengths
        ),
        cofounder_style   = COALESCE(
          (personality_profile->>'cofounder_style'),
          cofounder_style
        ),
        last_insight      = COALESCE(
          (personality_profile->>'last_insight'),
          last_insight
        )
      WHERE personality_profile IS NOT NULL
    $sql$;
  END IF;
END
$personality_profile_migration$;

-- Migrate old validation_receipts jsonb[] -> jsonb (array stored as jsonb).
-- Fresh v8 schemas already use jsonb, so only alter legacy jsonb[] columns.
DO $validation_receipts_migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'founder_memory'
      AND column_name = 'validation_receipts'
      AND udt_name = '_jsonb'
  ) THEN
    ALTER TABLE founder_memory
      ALTER COLUMN validation_receipts DROP DEFAULT,
      ALTER COLUMN validation_receipts TYPE jsonb
      USING to_jsonb(validation_receipts),
      ALTER COLUMN validation_receipts SET DEFAULT '[]'::jsonb;
  END IF;
END
$validation_receipts_migration$;

-- ── 2. Add processed_webhooks table for billing idempotency ──────────────────
--
-- Paystack can fire the same webhook event twice. Without this table, a user
-- could theoretically be upgraded/downgraded twice from a single payment.
-- The webhook handler now inserts here before processing; a unique constraint
-- violation (23505) means the event was already handled → return 200 immediately.

CREATE TABLE IF NOT EXISTS processed_webhooks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text        NOT NULL,
  event_key     text        NOT NULL,   -- Paystack reference or transaction id
  event_name    text,                   -- e.g. "charge.success"
  processed_at  timestamptz DEFAULT now(),
  UNIQUE (provider, event_key)
);

ALTER TABLE processed_webhooks ENABLE ROW LEVEL SECURITY;
-- No user-facing RLS policies — only accessible via service role key.

-- Auto-clean old records after 90 days to keep the table small.
-- Requires pg_cron extension (already enabled in schema).
DO $processed_webhooks_cleanup$
DECLARE jid integer;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO jid
    FROM cron.job
    WHERE jobname = 'cleanup-processed-webhooks';

    IF jid IS NOT NULL THEN
      PERFORM cron.unschedule(jid);
    END IF;

    PERFORM cron.schedule(
      'cleanup-processed-webhooks',
      '0 3 * * *',  -- 3 AM daily
      $$DELETE FROM processed_webhooks WHERE processed_at < now() - interval '90 days'$$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END
$processed_webhooks_cleanup$;

-- ============================================================================
-- End of migration
-- ============================================================================


-- ============================================================================
-- Source: 20260513000000_project_summaries_view.sql
-- ============================================================================

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


-- ============================================================================
-- Source: 20260513000001_disable_supabase_cron.sql
-- ============================================================================

-- Migration: 20260513000001_disable_supabase_cron.sql
--
-- Vercel cron (vercel.json) is the single authoritative scheduler for
-- BuildMind. This migration removes the competing pg_cron jobs so that
-- morning briefings and evening checks do not fire twice.
--
-- If you ever want to switch to pg_cron as the scheduler instead:
--   1. Remove the "crons" block from vercel.json
--   2. Re-run cron-schedule.sql (replacing YOUR_PROJECT_REF and YOUR_CRON_SECRET)
--   3. Drop this migration from your applied set
--
-- WHAT VERCEL HANDLES (do not re-add these to pg_cron):
--   /api/morning-briefing   — 0 5  * * *
--   /api/push/send-daily    — 0 7  * * *
--   /api/ai/weekly-report   — 0 7  * * 5
--   /api/billing/reconcile  — 0 8  * * *
--   /api/cron/evening-check — 0 18 * * *

DO $$
DECLARE jid integer;
BEGIN
  -- Morning briefing
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'morning-briefing';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;

  -- Evening check
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'evening-check';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;

  -- Daily push (may appear under either name)
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'daily-push';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;

  -- Weekly mirror / weekly report
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'weekly-mirror';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;

  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'weekly-report';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron extension not enabled — safe to ignore
  NULL;
END $$;


-- ============================================================================
-- Source: 20260513000002_admin_rls_policy.sql
-- ============================================================================

-- Migration: 20260513000002_admin_rls_policy.sql
--
-- Adds a Row Level Security policy that restricts admin data routes at the
-- database layer, not just at the API layer.
--
-- Previously, admin auth relied solely on the application-level
-- isAdminUser() check in lib/server/adminAuth.ts. If that check were
-- bypassed (e.g. a misconfigured middleware or direct Supabase query from a
-- client with the anon key), admin data would be readable by any
-- authenticated user.
--
-- This migration adds:
-- 1. An RLS policy on profiles so that non-admin users cannot read other
--    profiles' is_admin flag via the anon/authenticated role.
-- 2. An admin_audit_log table for tracking admin actions (plan overrides,
--    manual is_admin grants) so there is a durable record of who changed what.
--
-- NOTE: The service-role key (used in adminAuth.ts) bypasses RLS by design.
-- These policies only protect access via the anon or authenticated role.

-- ── 1. Harden profiles RLS ────────────────────────────────────────────────────
-- The existing policy "profiles_own_data" allows SELECT WHERE auth.uid() = id.
-- That already means users cannot see each other's rows at all. This is correct.
-- We add an explicit policy name to make intent auditable.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_self_only'
  ) THEN
    -- Drop the old unnamed / differently-named policy if present
    DROP POLICY IF EXISTS profiles_own_data ON profiles;

    DROP POLICY IF EXISTS profiles_self_only ON profiles;

    CREATE POLICY profiles_self_only ON profiles
      FOR ALL
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ── 2. Prevent any authenticated user from updating their own is_admin flag ───
-- Even with the SELECT policy above, an UPDATE could theoretically flip
-- is_admin to true if the WITH CHECK were too permissive. Lock it down.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_cannot_self_promote_admin'
  ) THEN
    DROP POLICY IF EXISTS profiles_cannot_self_promote_admin ON profiles;
    CREATE POLICY profiles_cannot_self_promote_admin ON profiles
      AS RESTRICTIVE
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (
        -- The user can update their own row BUT only if is_admin stays the same.
        -- is_admin can only be changed via the service-role key (bypasses RLS).
        is_admin = (SELECT is_admin FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ── 3. Admin audit log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid        NOT NULL,           -- who performed the action
  action      text        NOT NULL,           -- e.g. 'plan_override', 'grant_admin'
  target_id   uuid,                           -- user/resource affected
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Service-role only — never exposed to authenticated/anon roles
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_audit_log_no_client_access ON admin_audit_log;

CREATE POLICY admin_audit_log_no_client_access ON admin_audit_log
  AS RESTRICTIVE
  FOR ALL
  USING (false);   -- blocks all anon + authenticated access; service_role bypasses

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id
  ON admin_audit_log(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_id
  ON admin_audit_log(target_id, created_at DESC);

COMMENT ON TABLE admin_audit_log IS
  'Append-only log of all admin actions. Written by server routes using '
  'the service-role key. Not readable by any client role.';



-- ============================================================================
-- Source: 20260514000000_testimonials.sql
-- ============================================================================

-- Migration: 20260514000000_testimonials.sql
--
-- Creates the testimonials table for storing founder feedback.
-- Triggered from the TestimonialModal component after:
--   - 7-day streak (streak milestone in reflect/page.tsx)
--   - Completed outcome + confidence >= 4 (strong positive session)
--   - Manual prompt from admin
--
-- Columns:
--   id            — primary key
--   user_id       — FK to auth.users (nullable: allows pre-seeded testimonials)
--   display_name  — what to show publicly (full name or "Founder in Lagos")
--   avatar_url    — optional profile photo
--   streak        — streak at time of submission (social proof signal)
--   stage         — startup stage at time (Idea / Validation / MVP / Launch / Growth)
--   quote         — the testimonial text (required, max 400 chars)
--   rating        — 1–5 (optional, defaults to 5)
--   is_public     — founder opted in to public display (default false until confirmed)
--   source        — where the prompt was shown: 'streak_7' | 'streak_14' | 'high_confidence' | 'admin'
--   created_at
--   approved_at   — set by admin when approved for public use (nullable)

CREATE TABLE IF NOT EXISTS testimonials (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name  text        NOT NULL DEFAULT 'Anonymous founder',
  avatar_url    text,
  streak        int2        NOT NULL DEFAULT 0,
  stage         text        NOT NULL DEFAULT 'Idea',
  quote         text        NOT NULL CHECK (char_length(quote) BETWEEN 10 AND 400),
  rating        int2        NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  is_public     boolean     NOT NULL DEFAULT false,
  source        text        NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('streak_7', 'streak_14', 'high_confidence', 'streak_30', 'admin', 'manual')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  approved_at   timestamptz
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

-- Users can read their own testimonials
DROP POLICY IF EXISTS testimonials_read_own ON testimonials;
CREATE POLICY testimonials_read_own ON testimonials
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own testimonials
DROP POLICY IF EXISTS testimonials_insert_own ON testimonials;
CREATE POLICY testimonials_insert_own ON testimonials
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own (e.g. toggle is_public, edit quote)
DROP POLICY IF EXISTS testimonials_update_own ON testimonials;
CREATE POLICY testimonials_update_own ON testimonials
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public-approved testimonials are readable by everyone (for landing page)
DROP POLICY IF EXISTS testimonials_read_approved ON testimonials;
CREATE POLICY testimonials_read_approved ON testimonials
  FOR SELECT
  USING (is_public = true AND approved_at IS NOT NULL);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_testimonials_user_id
  ON testimonials(user_id);

CREATE INDEX IF NOT EXISTS idx_testimonials_public_approved
  ON testimonials(is_public, approved_at DESC)
  WHERE is_public = true AND approved_at IS NOT NULL;

COMMENT ON TABLE testimonials IS
  'Founder testimonials collected in-product at high-engagement moments. '
  'is_public + approved_at must both be set before a testimonial appears on the landing page.';



-- ============================================================================
-- Source: 20260514000001_free_trial.sql
-- ============================================================================

-- Migration: 7-day free trial system
-- Adds trial_started_at and trial_ends_at to profiles/auth metadata.
-- Used by plan.ts to grant Builder access during the trial window,
-- then enforce a hard paywall on day 8.
--
-- No new table needed — we use user_metadata (set via admin client on signup)
-- and track trial expiry in founder_context for server-authoritative checks.

ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS trial_started_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trial_ends_at     TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trial_expired     BOOLEAN     NOT NULL DEFAULT FALSE;

-- Index for the billing-status cron that checks expired trials
CREATE INDEX IF NOT EXISTS idx_founder_context_trial_ends_at
  ON founder_context (trial_ends_at)
  WHERE trial_ends_at IS NOT NULL AND trial_expired = FALSE;

-- Helper: mark trial as expired (called by billing/status route on day 8+)
CREATE OR REPLACE FUNCTION expire_free_trial(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE founder_context
  SET trial_expired = TRUE
  WHERE user_id = p_user_id
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < NOW()
    AND trial_expired = FALSE;
END;
$$;


-- ============================================================================
-- Source: 20260515000000_daily_ai_cap.sql
-- ============================================================================

-- Migration: 20260515000000_daily_ai_cap.sql
--
-- Adds per-day AI usage tracking for free users so a single heavy session
-- cannot consume the entire monthly quota in one day.
--
-- Design:
--   - ai_usage_daily table mirrors ai_usage but keyed by (user_id, date).
--   - increment_ai_usage_daily_capped RPC atomically increments and enforces
--     the daily cap in one round-trip (same SELECT FOR UPDATE pattern as the
--     monthly RPC to prevent race conditions).
--   - Builder plan: daily table is updated for tracking but no cap is enforced
--     (same unlimited behaviour as the monthly table).
--   - Free plan: capped at FREE_DAILY_AI_LIMIT (3 calls/day by default).
--     This means a free user can open /today up to 3 times in a day and get
--     a full Reflexion response. On the 4th call they receive a 429 with an
--     upgrade prompt.
--
-- The daily limit (3) × 30 days = 90 potential calls, which is intentionally
-- above the monthly cap (30) so that the monthly cap remains the binding
-- constraint for light daily users while preventing burst abuse.

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date      date        NOT NULL DEFAULT CURRENT_DATE,
  count     integer     NOT NULL DEFAULT 0 CHECK (count >= 0),
  CONSTRAINT ai_usage_daily_user_date_key UNIQUE (user_id, date)
);

ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;

-- Users can read their own daily usage (for the usage badge in the UI)
DROP POLICY IF EXISTS ai_usage_daily_read_own ON ai_usage_daily;
CREATE POLICY ai_usage_daily_read_own ON ai_usage_daily
  FOR SELECT USING (auth.uid() = user_id);

-- No client writes — all writes go through the service_role RPC
CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_user_date
  ON ai_usage_daily(user_id, date DESC);

-- ── Capped daily increment ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_ai_usage_daily_capped(
  p_user_id  uuid,
  p_date     date,
  p_limit    integer   -- pass -1 for unlimited (builder)
)
RETURNS integer        -- new count, or -1 if cap already reached
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current   integer := 0;
  v_new_count integer;
BEGIN
  -- Short-circuit for unlimited plans (Builder) — just track
  IF p_limit = -1 THEN
    INSERT INTO ai_usage_daily (user_id, date, count)
      VALUES (p_user_id, p_date, 1)
    ON CONFLICT (user_id, date)
      DO UPDATE SET count = ai_usage_daily.count + 1
    RETURNING count INTO v_new_count;
    RETURN v_new_count;
  END IF;

  -- Free plan: ensure row exists, then lock and check
  INSERT INTO ai_usage_daily (user_id, date, count)
    VALUES (p_user_id, p_date, 0)
  ON CONFLICT (user_id, date) DO NOTHING;

  SELECT count INTO v_current
    FROM ai_usage_daily
   WHERE user_id = p_user_id AND date = p_date
     FOR UPDATE;

  IF v_current >= p_limit THEN
    RETURN -1;
  END IF;

  UPDATE ai_usage_daily
     SET count = count + 1
   WHERE user_id = p_user_id AND date = p_date
  RETURNING count INTO v_new_count;

  RETURN v_new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_ai_usage_daily_capped(uuid, date, integer)
  TO service_role;

COMMENT ON TABLE ai_usage_daily IS
  'Per-day AI call counts per user. Used to enforce a daily burst cap for '
  'free users (3 calls/day) independently of the monthly cap (30/month). '
  'Builder plan rows are written for analytics but no cap is enforced.';



-- ============================================================================
-- Source: 20260515000001_welcome_email_sent.sql
-- ============================================================================

-- Migration: 20260515000001_welcome_email_sent.sql
--
-- Adds welcome_email_sent boolean to profiles so the welcome email
-- is sent exactly once per user regardless of page refreshes or retries.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS welcome_email_sent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.welcome_email_sent IS
  'Set to true after POST /api/user/welcome-email succeeds. '
  'Prevents duplicate welcome emails on onboarding page refreshes.';


-- ============================================================================
-- Source: 20260516000000_re_engagement_tracking.sql
-- ============================================================================

-- Migration: 20260516000000_re_engagement_tracking
--
-- Adds last_re_engagement_email_at to founder_context so the re-engage cron
-- (/api/cron/re-engage) can avoid double-sending emails to the same user
-- within a re-engagement window.
--
-- Also indexes days_inactive for the cron's range query — without this the
-- re-engage query does a full table scan which gets expensive at scale.

-- 1. Column (idempotent)
ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS last_re_engagement_email_at timestamptz;

COMMENT ON COLUMN founder_context.last_re_engagement_email_at IS
  'Timestamp of the last re-engagement email sent to this founder. '
  'Used by /api/cron/re-engage to prevent double-sending within a 5-day window.';

-- 2. Index for the cron's days_inactive range query
CREATE INDEX IF NOT EXISTS idx_founder_context_days_inactive
  ON founder_context (days_inactive)
  WHERE days_inactive >= 6;

-- 3. Index for lookups that filter by last_re_engagement_email_at
CREATE INDEX IF NOT EXISTS idx_founder_context_re_engagement
  ON founder_context (last_re_engagement_email_at)
  WHERE last_re_engagement_email_at IS NOT NULL;


-- ============================================================================
-- Source: 20260516000001_revenue_tracking.sql
-- ============================================================================

-- Migration: Revenue tracking fields
-- Adds current_mrr to projects and revenue_delta to reflections
-- These feed the reflexion loop so it reasons against real financial numbers
-- rather than giving generic advice.

-- Add current MRR to projects (manually entered by founder, updated any time)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS current_mrr integer DEFAULT 0 CHECK (current_mrr >= 0),
  ADD COLUMN IF NOT EXISTS mrr_updated_at timestamp DEFAULT now();

COMMENT ON COLUMN projects.current_mrr IS
  'Current monthly recurring revenue in smallest currency unit (pesewas/cents). '
  'Manually entered by founder. Fed into reflexion loop for revenue-aware task generation.';

-- Add revenue delta to reflections (optional: "did this move the needle?")
ALTER TABLE reflections
  ADD COLUMN IF NOT EXISTS revenue_delta integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS revenue_delta_note text DEFAULT NULL;

COMMENT ON COLUMN reflections.revenue_delta IS
  'Optional revenue change attributed to this task completion, in smallest currency unit. '
  'Null = founder did not attribute revenue. 0 = explicitly no impact. Positive = gain.';

COMMENT ON COLUMN reflections.revenue_delta_note IS
  'Free-text attribution note, e.g. "Closed 2 new customers at GHS 200 each".';


-- ============================================================================
-- Source: 20260517000000_conversation_continuity_and_tag_normalization.sql
-- ============================================================================

-- 20260517000000_conversation_continuity_and_tag_normalization.sql
--
-- AI Improvement #2: Add recent_interactions JSONB to founder_context
--   Stores last 10 AI interactions across all features for cross-feature
--   conversation continuity (see lib/conversationContinuity.ts).
--
-- AI Improvement #3: Enable pgvector + add tag embedding columns
--   Adds embedding vectors for personality_tags and avoidance_zones so
--   semantic deduplication can identify "ships fast" ≡ "moves quickly"
--   without substring heuristics.
--   NOTE: embeddings are populated lazily by the /api/ai/embed-tags job,
--   not by this migration. The columns are nullable until first populated.
--
-- Engineering Fix #2: Add last_re_engagement_email_at column used by the
--   re-engage worker to avoid double-sending within the same wave.

-- ── pgvector extension ────────────────────────────────────────────────────────
-- Enable on Supabase via Dashboard → Extensions → vector, OR with this SQL.
-- Supabase supports pgvector natively on all plans.
create extension if not exists vector;

-- ── founder_context additions ─────────────────────────────────────────────────

alter table founder_context
  -- Cross-feature conversation continuity (AI Improvement #2)
  add column if not exists recent_interactions jsonb default '[]'::jsonb,

  -- Re-engagement tracking (Engineering Fix #2 worker)
  add column if not exists last_re_engagement_email_at timestamptz,

  -- pgvector tag embeddings (AI Improvement #3)
  -- 1536-dim for text-embedding-3-small (OpenAI) or 384-dim for bge-small
  -- We use 768 as a safe default that works for most embedding models.
  add column if not exists personality_tags_embedding vector(768),
  add column if not exists avoidance_zones_embedding vector(768);

-- IVFFlat index for cosine similarity search on tag embeddings
-- Will be used by semantic deduplication and future "founders like you" feature.
-- Created with lists=10 (appropriate for <10k rows; increase to 100 at 100k rows).
create index if not exists idx_founder_context_personality_tags_embedding
  on founder_context
  using ivfflat (personality_tags_embedding vector_cosine_ops)
  with (lists = 10);

create index if not exists idx_founder_context_avoidance_zones_embedding
  on founder_context
  using ivfflat (avoidance_zones_embedding vector_cosine_ops)
  with (lists = 10);

-- Index on recent_interactions for the cron that prunes old entries
create index if not exists idx_founder_context_recent_interactions_gin
  on founder_context using gin (recent_interactions);

-- ── RLS policy for recent_interactions ───────────────────────────────────────
-- Reuse existing pattern: user can only read/write their own row.
-- (No new policy needed if the existing founder_context RLS covers all columns.)

-- ── Comment documentation ─────────────────────────────────────────────────────
comment on column founder_context.recent_interactions is
  'Array of last 10 AI interactions across all features. Schema: [{feature, summary, timestamp, emotionalSignal?}]. Populated by recordInteractionServer() in lib/conversationContinuity.ts.';

comment on column founder_context.personality_tags_embedding is
  'Mean-pooled embedding vector of personality_tags string array. Used for semantic deduplication and future founder-similarity features. Populated lazily by /api/ai/embed-tags.';

comment on column founder_context.avoidance_zones_embedding is
  'Mean-pooled embedding vector of avoidance_zones string array. Same purpose as personality_tags_embedding.';

comment on column founder_context.last_re_engagement_email_at is
  'Timestamp of last re-engagement email sent. Used by the re-engage cron worker to prevent duplicate emails within the same wave (7d / 14d).';


-- ============================================================================
-- Source: 20260517000001_benchmarks.sql
-- ============================================================================

-- 20260517000001_benchmarks.sql
--
-- AI Improvement #5: Aggregated benchmarking layer (data moat foundation)
--
-- Two tables:
--   benchmark_events   — raw anonymized events (no user_id — privacy by design)
--   benchmark_cohorts  — pre-aggregated stats, updated nightly by cron
--
-- The nightly aggregation cron (/api/cron/aggregate-benchmarks) reads from
-- benchmark_events and writes to benchmark_cohorts using window functions.
-- Cohorts with sample_size < 10 are excluded to prevent re-identification.

-- ── benchmark_events (raw, append-only, anonymized) ──────────────────────────

create table if not exists benchmark_events (
  id              bigserial primary key,
  signal_type     text        not null,   -- avoidance|task_completed|pivot|stall…
  stage           text        not null,   -- Idea|MVP|Launch|Growth
  category        text,                   -- task category for avoidance events
  momentum_bucket smallint    not null,   -- 20|30|40|50|60|70|80|90|100
  week_of_year    smallint    not null,   -- 1–52
  created_at      timestamptz not null default now()
  -- NOTE: intentionally no user_id column — privacy by design
);

-- Partition on signal_type for fast cohort aggregation queries
create index if not exists idx_benchmark_events_signal_stage
  on benchmark_events (signal_type, stage, created_at desc);

create index if not exists idx_benchmark_events_stage_category
  on benchmark_events (stage, category);

-- ── benchmark_cohorts (pre-aggregated, refreshed nightly) ────────────────────

create table if not exists benchmark_cohorts (
  id                      bigserial primary key,
  stage                   text     not null,
  signal_type             text     not null,
  category                text,
  sample_size             int      not null default 0,
  median_momentum         numeric(5,2) not null default 0,
  completion_rate         numeric(5,4) not null default 0, -- 0.0000–1.0000
  pivot_rate              numeric(5,4) not null default 0,
  recovery_rate           numeric(5,4) not null default 0,
  avg_days_to_first_user  numeric(8,2),
  insight_text            text,    -- natural language insight, AI-generated nightly
  updated_at              timestamptz not null default now()
);

create unique index if not exists benchmark_cohorts_unique_stage_signal_category
  on benchmark_cohorts (stage, signal_type, coalesce(category, ''));

create index if not exists idx_benchmark_cohorts_stage_signal
  on benchmark_cohorts (stage, signal_type, sample_size desc);

-- ── RLS — benchmark_events is insert-only for authenticated users ─────────────
-- No read access for users — only service role reads for aggregation.

alter table benchmark_events enable row level security;

-- Authenticated users can insert (write their anonymized events)
DROP POLICY IF EXISTS "benchmark_events_insert_authenticated" ON benchmark_events;
create policy "benchmark_events_insert_authenticated"
  on benchmark_events
  for insert
  to authenticated
  with check (true);

-- No SELECT for regular users — only service role (aggregation cron)
DROP POLICY IF EXISTS "benchmark_events_no_select" ON benchmark_events;
create policy "benchmark_events_no_select"
  on benchmark_events
  for select
  to authenticated
  using (false);

-- ── RLS — benchmark_cohorts is read-only for authenticated users ──────────────
alter table benchmark_cohorts enable row level security;

DROP POLICY IF EXISTS "benchmark_cohorts_select_authenticated" ON benchmark_cohorts;

create policy "benchmark_cohorts_select_authenticated"
  on benchmark_cohorts
  for select
  to authenticated
  using (sample_size >= 10);  -- enforce minimum cohort size at DB level

-- No user writes to cohorts — only service role from aggregation cron
DROP POLICY IF EXISTS "benchmark_cohorts_no_insert" ON benchmark_cohorts;
create policy "benchmark_cohorts_no_insert"
  on benchmark_cohorts
  for insert
  to authenticated
  with check (false);

-- ── Comments ──────────────────────────────────────────────────────────────────

comment on table benchmark_events is
  'Anonymized founder behavior events for collective intelligence. No user_id stored. See lib/benchmarks.ts.';

comment on table benchmark_cohorts is
  'Pre-aggregated cohort statistics. Refreshed nightly by /api/cron/aggregate-benchmarks. Sample size < 10 rows are excluded by RLS. See lib/benchmarks.ts.';



-- ============================================================================
-- Source: 20260517000002_teams_waitlist.sql
-- ============================================================================

-- 20260517000002_teams_waitlist.sql
-- Growth Improvement #3: Teams waitlist
-- Captures demand for "BuildMind for Teams" before the feature exists.

create table if not exists teams_waitlist (
  id           bigserial    primary key,
  email        text         not null unique,
  use_case     text,        -- co-founders | small_team | investor_updates | other
  team_size    smallint,
  user_id      uuid         references auth.users(id) on delete set null,
  submitted_at timestamptz  not null default now(),
  notified_at  timestamptz  -- set when early-access email is sent at launch
);

create index if not exists idx_teams_waitlist_submitted_at on teams_waitlist (submitted_at desc);

-- No RLS — service role only (no user needs to read their own waitlist row)
alter table teams_waitlist enable row level security;

-- Users can insert their own entry
DROP POLICY IF EXISTS "teams_waitlist_insert" ON teams_waitlist;
create policy "teams_waitlist_insert"
  on teams_waitlist for insert to authenticated
  with check (true);

-- Users cannot read any rows
DROP POLICY IF EXISTS "teams_waitlist_no_select" ON teams_waitlist;
create policy "teams_waitlist_no_select"
  on teams_waitlist for select to authenticated
  using (false);

comment on table teams_waitlist is
  'Teams early-access waitlist. See /api/waitlist/teams and Growth Improvement #3.';



-- ============================================================================
-- Source: 20260517000003_weekly_reports_share.sql
-- ============================================================================

-- 20260517000003_weekly_reports_share.sql
-- Growth Improvement #4: Shareable weekly report
-- Stores generated weekly reports with a public share token.
-- /reports/share/[token] renders a public card — no auth required.

create table if not exists weekly_reports (
  id          bigserial    primary key,
  user_id     uuid         not null references auth.users(id) on delete cascade,
  share_token text         not null,
  report_data jsonb        not null default '{}'::jsonb,
  ai_summary  text,
  created_at  timestamptz  not null default now(),
  -- Each user can have multiple weekly reports; token is globally unique
  constraint weekly_reports_share_token_unique unique (share_token)
);

create index if not exists idx_weekly_reports_user_id
  on weekly_reports (user_id, created_at desc);

create index if not exists idx_weekly_reports_share_token
  on weekly_reports (share_token);

-- RLS
alter table weekly_reports enable row level security;

-- Authenticated user can read their own reports
DROP POLICY IF EXISTS "weekly_reports_select_own" ON weekly_reports;
create policy "weekly_reports_select_own"
  on weekly_reports for select to authenticated
  using (auth.uid() = user_id);

-- Authenticated user can insert their own reports
DROP POLICY IF EXISTS "weekly_reports_insert_own" ON weekly_reports;
create policy "weekly_reports_insert_own"
  on weekly_reports for insert to authenticated
  with check (auth.uid() = user_id);

-- PUBLIC read by share token (for /reports/share/[token] page)
-- Any visitor can read a report row if they know the share token.
-- report_data and ai_summary do not contain PII (user_id is not exposed).
DROP POLICY IF EXISTS "weekly_reports_select_by_token" ON weekly_reports;
create policy "weekly_reports_select_by_token"
  on weekly_reports for select to anon
  using (true);  -- anon role can only read; RLS on other ops still applies

comment on table weekly_reports is
  'AI-generated weekly reports. Public share via /reports/share/[share_token]. See Growth Improvement #4.';
comment on column weekly_reports.share_token is
  '24-char hex token (crypto.randomUUID stripped). Used as public URL path — not guessable.';



-- ============================================================================
-- Source: 20260517000004_funnel_events.sql
-- ============================================================================

-- 20260517000004_funnel_events.sql
-- Growth Improvement #5: Server-side onboarding funnel tracking
-- All funnel events from the client are persisted here for real analytics.
-- The admin dashboard reads /api/analytics/funnel to see drop-off rates.

create table if not exists funnel_events (
  id         bigserial    primary key,
  user_id    uuid         references auth.users(id) on delete set null,
  step       text         not null,
  meta       jsonb,
  session_id text,        -- client-generated session id for multi-step attribution
  referrer   text,        -- referring URL for source attribution
  user_agent text,        -- truncated UA string for device segmentation
  created_at timestamptz  not null default now()
);

-- Index for per-step counts (used by admin analytics query)
create index if not exists idx_funnel_events_step_created
  on funnel_events (step, created_at desc);

-- Index for per-user funnel (used to find where a specific user dropped off)
create index if not exists idx_funnel_events_user_id
  on funnel_events (user_id, created_at asc)
  where user_id is not null;

-- RLS
alter table funnel_events enable row level security;

-- Authenticated users can insert their own events
DROP POLICY IF EXISTS "funnel_events_insert_authenticated" ON funnel_events;
create policy "funnel_events_insert_authenticated"
  on funnel_events for insert to authenticated
  with check (auth.uid() = user_id or user_id is null);

-- No user reads — admin only via service role
DROP POLICY IF EXISTS "funnel_events_no_select" ON funnel_events;
create policy "funnel_events_no_select"
  on funnel_events for select to authenticated
  using (false);

-- Anon can insert (for pre-auth funnel steps like landing page visit)
DROP POLICY IF EXISTS "funnel_events_insert_anon" ON funnel_events;
create policy "funnel_events_insert_anon"
  on funnel_events for insert to anon
  with check (user_id is null);

comment on table funnel_events is
  'Server-side onboarding funnel events. See /api/analytics/funnel and Growth Improvement #5.';



-- ============================================================================
-- Source: 20260517000005_public_profile_optin.sql
-- ============================================================================

-- 20260517000005_public_profile_optin.sql
-- Product Improvement #9: Public Founder Score (feature flag off — UI + backend ready)
-- Adds opt-in columns to profiles so founders control their public visibility.

alter table profiles
  add column if not exists public_profile  boolean      not null default false,
  add column if not exists username        text         unique,
  add column if not exists joined_at       timestamptz  not null default now();

-- Index for username lookups (public profile page)
create index if not exists idx_profiles_username
  on profiles (username)
  where public_profile = true;

comment on column profiles.public_profile is
  'Founder opted in to public /founder/[username] profile. Default false. See FEATURES.publicFounderScore.';
comment on column profiles.username is
  'URL-safe handle for /founder/[username] page. Unique. Set via settings when opting in.';


-- ============================================================================
-- Source: 20260518000000_morning_checkin_and_depth_answers.sql
-- ============================================================================

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


-- ============================================================================
-- Source: 20260519000000_funnel_rpc.sql
-- ============================================================================

-- 20260519000000_funnel_rpc.sql
--
-- Adds the increment_funnel_step RPC called by /api/analytics/funnel-event/route.ts
-- The funnel_events table was created in 20260517000004 but the RPC was never added,
-- causing all funnel analytics to silently record zero data.

CREATE OR REPLACE FUNCTION increment_funnel_step(
  p_step     text,
  p_user_id  uuid    DEFAULT NULL,
  p_meta     jsonb   DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO funnel_events (user_id, step, meta, created_at)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    p_step,
    p_meta,
    now()
  );
END;
$$;

-- Grant execute to authenticated and anon (rate limiting is handled at the API layer)
GRANT EXECUTE ON FUNCTION increment_funnel_step(text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_funnel_step(text, uuid, jsonb) TO anon;

COMMENT ON FUNCTION increment_funnel_step(text, uuid, jsonb) IS
  'Inserts a funnel event row. Called by /api/analytics/funnel-event. Added by migration 20260519000000 — the table existed since 20260517000004 but the RPC was missing.';


-- ============================================================================
-- Source: 20260520000001_project_analyses_cache.sql
-- ============================================================================

-- project_analyses — Break My Startup result cache (Audit v8 ENG #9)
--
-- PROBLEM: Break My Startup runs 5 parallel LLM calls every time.
-- Most inputs don't change between runs. Cache by (project_id, inputs_hash).
-- SECONDARY VALUE: queryable by benchmark pipeline for aggregate signals.

CREATE TABLE IF NOT EXISTS project_analyses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Hash of description+stage+problem+target_users — changes when project changes
  inputs_hash      text NOT NULL,
  -- Full Break My Startup result JSON
  result           jsonb NOT NULL,
  -- Top-level signals as dedicated columns for fast benchmark aggregation
  survival_score   int  CHECK (survival_score BETWEEN 0 AND 100),
  confidence_score real CHECK (confidence_score BETWEEN 0 AND 1),
  verdict          text CHECK (verdict IN ('strong', 'viable', 'risky', 'critical')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One analysis row per project (latest wins on upsert)
CREATE UNIQUE INDEX IF NOT EXISTS project_analyses_project_id_idx
  ON project_analyses (project_id);

CREATE INDEX IF NOT EXISTS project_analyses_verdict_score_idx
  ON project_analyses (verdict, survival_score) WHERE verdict IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_analyses_updated_at_idx
  ON project_analyses (updated_at DESC);

ALTER TABLE project_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_analyses_select_own" ON project_analyses;

CREATE POLICY "project_analyses_select_own" ON project_analyses FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "project_analyses_insert_own" ON project_analyses;
CREATE POLICY "project_analyses_insert_own" ON project_analyses FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "project_analyses_update_own" ON project_analyses;
CREATE POLICY "project_analyses_update_own" ON project_analyses FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "project_analyses_delete_own" ON project_analyses;
CREATE POLICY "project_analyses_delete_own" ON project_analyses FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_project_analyses_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_project_analyses_updated_at ON project_analyses;

CREATE TRIGGER trg_project_analyses_updated_at
  BEFORE UPDATE ON project_analyses
  FOR EACH ROW EXECUTE FUNCTION update_project_analyses_updated_at();




-- ============================================================================
-- Source: 20260520000002_subscriptions_table.sql
-- ============================================================================

-- subscriptions — proper billing table (Audit v8 ENG #1)
--
-- PROBLEM: Billing data was stored in auth.users.user_metadata (JWT). This means:
--   (a) plan reads require an admin auth call or trusting a potentially stale JWT
--   (b) no payment history or subscription lifecycle tracking
--   (c) "all builder users" requires fetching all auth users
--   (d) JWT staleness: user who just paid may see "free" for up to JWT lifetime
--
-- SOLUTION: A dedicated subscriptions table that is the authoritative billing source.
-- The billing server (lib/billing/server.ts) writes here on every Paystack event.
-- Plan checks read from here (single indexed query). JWT metadata is kept in sync
-- as a cache but is never the source of truth for access decisions.
--
-- MIGRATION STRATEGY: This is additive — existing user_metadata billing data is NOT
-- migrated automatically (too risky without a tested backfill script). Instead:
--   1. New payments write to BOTH user_metadata AND this table.
--   2. getEffectivePlan() checks this table first; falls back to user_metadata.
--   3. A one-time backfill script (run manually) will populate rows from user_metadata.
--   4. Once backfill is confirmed, user_metadata billing fields can be deprecated.

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core billing state
  plan                    text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'builder')),
  status                  text NOT NULL DEFAULT 'free'
                            CHECK (status IN ('active', 'canceled', 'processing', 'free', 'grace')),

  -- Provider info
  provider                text CHECK (provider IN ('paystack', 'stripe')),
  provider_subscription_id text,
  provider_customer_id    text,
  provider_reference      text,   -- Paystack reference / Stripe payment_intent

  -- Lifecycle timestamps
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  grace_period_ends_at    timestamptz,  -- set on payment failure; builder access until this date
  canceled_at             timestamptz,
  trial_ends_at           timestamptz,  -- mirrors founder_context.trial_ends_at for join-free reads

  -- Metadata
  customer_email          text,
  amount_minor            int,    -- in minor currency units (pesewas for GHS, cents for USD)
  currency                text DEFAULT 'GHS',

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- One subscription row per user (upsert on user_id)
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions (user_id);

-- Fast plan lookups by plan+status (used by benchmark cron to find all builder users)
CREATE INDEX IF NOT EXISTS subscriptions_plan_status_idx ON subscriptions (plan, status);

-- Grace period expiry sweep
CREATE INDEX IF NOT EXISTS subscriptions_grace_period_idx
  ON subscriptions (grace_period_ends_at)
  WHERE grace_period_ends_at IS NOT NULL;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
DROP POLICY IF EXISTS "subscriptions_select_own" ON subscriptions;
CREATE POLICY "subscriptions_select_own" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
-- Only service role (backend) can insert/update — never the client directly
-- (Client uses API routes which use the admin client)

CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_subscriptions_updated_at();

COMMENT ON TABLE subscriptions IS
  'Authoritative billing source. Written by billing webhook + persistUserPlan(). '
  'getEffectivePlan() reads this first; falls back to user_metadata during transition period.';




-- ============================================================================
-- Source: 20260520000003_consolidate_name_title.sql
-- ============================================================================

-- Consolidate name/title dual-column on projects (Audit v8 ENG #5)
--
-- PROBLEM: projects table has both `name` and `title` columns. Queries use
-- `name ?? title` or `title ?? name` inconsistently. This causes:
--   (a) Ambiguous "which is canonical?" questions in every query
--   (b) New rows can end up with data in either column depending on the code path
--   (c) The UI shows stale/empty names when the wrong column is used
--
-- SOLUTION: Make `name` canonical. Backfill name from title where name is null.
-- Add a NOT NULL constraint. Keep `title` temporarily as a generated column
-- (alias) so existing queries don't break, then drop it in a follow-up migration
-- once all query references are updated.

-- Step 1: Backfill — set name = title wherever name is null or empty
UPDATE projects
SET name = title
WHERE (name IS NULL OR name = '') AND title IS NOT NULL AND title != '';

-- Step 2: For any remaining rows with neither, set a placeholder
UPDATE projects
SET name = 'Untitled Project'
WHERE name IS NULL OR name = '';

-- Step 3: Add NOT NULL constraint now that all rows have a name
ALTER TABLE projects ALTER COLUMN name SET NOT NULL;

-- Step 4: Keep title as a nullable alias for now (backward compat during code cleanup)
-- Once all code references to `title` are removed, run:
--   ALTER TABLE projects DROP COLUMN title;
-- (do NOT run this now — staged removal is safer)

-- Step 5: Add a check to prevent new rows from using title without name
-- (application-level enforcement via the NOT NULL on name is sufficient)

COMMENT ON COLUMN projects.name IS
  'Canonical project name. Always populated. title column is deprecated — use name.';

COMMENT ON COLUMN projects.title IS
  'DEPRECATED. Use name. Will be dropped after all code references are removed.';


-- ============================================================================
-- Source: 20260520000004_integrations_table.sql
-- ============================================================================

-- integrations — Notion + Linear OAuth token storage (Audit v8 PROD #8)
--
-- Stores third-party integration credentials for pulling real task context
-- into the Reflexion pipeline. One row per user per provider.

CREATE TABLE IF NOT EXISTS integrations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider     text NOT NULL CHECK (provider IN ('notion', 'linear')),
  access_token text NOT NULL,
  workspace_id text,
  database_id  text,     -- Notion DB ID or Linear team ID
  metadata     jsonb,    -- e.g. workspace name, user email
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integrations_select_own" ON integrations;

CREATE POLICY "integrations_select_own" ON integrations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "integrations_insert_own" ON integrations;
CREATE POLICY "integrations_insert_own" ON integrations FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "integrations_update_own" ON integrations;
CREATE POLICY "integrations_update_own" ON integrations FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "integrations_delete_own" ON integrations;
CREATE POLICY "integrations_delete_own" ON integrations FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS integrations_user_provider_idx ON integrations (user_id, provider);

CREATE OR REPLACE FUNCTION update_integrations_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_integrations_updated_at ON integrations;

CREATE TRIGGER trg_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_integrations_updated_at();



