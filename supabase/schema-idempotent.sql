-- ============================================================================
-- BuildMind Complete Schema - FRESH INSTALL ONLY
--
-- ⚠️  WARNING: THIS FILE DROPS ALL TABLES AND ALL DATA BEFORE RECREATING.
-- ⚠️  DO NOT RUN THIS ON A DATABASE THAT HAS REAL USER DATA.
--
-- Use this ONLY for:
--   - First-time local dev setup
--   - CI/CD test environments that start from scratch
--
-- For production schema changes use the numbered migrations in:
--   supabase/migrations/  (run in timestamp order via Supabase dashboard)
--
-- For a safe schema audit of an existing database use:
--   supabase/schema-verify-and-init.sql  (additive only, never drops)
-- ============================================================================

-- Drop old triggers if they exist (prevents "already exists" errors)
DROP TRIGGER IF EXISTS founder_memory_updated_at ON founder_memory;
DROP TRIGGER IF EXISTS founder_context_updated_at ON founder_context;
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS projects_updated_at ON projects;
DROP TRIGGER IF EXISTS milestones_updated_at ON milestones;
DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
DROP TRIGGER IF EXISTS reflections_updated_at ON reflections;
DROP TRIGGER IF EXISTS notifications_updated_at ON notifications;
DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON push_subscriptions;
DROP TRIGGER IF EXISTS execution_scorecards_updated_at ON execution_scorecards;
DROP TRIGGER IF EXISTS ventures_blueprints_updated_at ON ventures_blueprints;

-- Drop trigger functions if they exist
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Drop tables if they exist (in reverse dependency order)
DROP TABLE IF EXISTS processed_webhooks CASCADE;
DROP TABLE IF EXISTS waitlist CASCADE;
DROP TABLE IF EXISTS cofounder_reframe_log CASCADE;
DROP TABLE IF EXISTS ai_usage CASCADE;
DROP TABLE IF EXISTS execution_scorecards CASCADE;
DROP TABLE IF EXISTS ventures_blueprints CASCADE;
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS task_overrides CASCADE;
DROP TABLE IF EXISTS feed_events CASCADE;
DROP TABLE IF EXISTS reflexion_quality_log CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS reflections CASCADE;
DROP TABLE IF EXISTS scheduled_job_log CASCADE;
DROP TABLE IF EXISTS evening_checks CASCADE;
DROP TABLE IF EXISTS morning_briefings CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS milestones CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS founder_context CASCADE;
DROP TABLE IF EXISTS founder_memory CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- UTILITY FUNCTION: Update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================================================
-- TABLE: profiles (user identity)
-- ============================================================================
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  bio text,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_own_data ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: processed_webhooks (idempotency store for billing webhooks)
-- Prevents double-processing when payment providers fire duplicate events.
-- ============================================================================
CREATE TABLE processed_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_key text NOT NULL,
  event_name text,
  processed_at timestamptz DEFAULT now(),
  UNIQUE (provider, event_key)
);

ALTER TABLE processed_webhooks ENABLE ROW LEVEL SECURITY;
-- Only service-role can access this table (no user-facing RLS policies needed)

-- ============================================================================
-- TABLE: founder_memory (core identity storage — replaces CodEx)
-- ============================================================================
CREATE TABLE founder_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Fields aligned with TypeScript FounderMemory type
  personality_tags text[] NOT NULL DEFAULT '{}',
  decision_patterns jsonb NOT NULL DEFAULT '[]',
  emotional_signals jsonb NOT NULL DEFAULT '[]',
  avoidance_zones text[] NOT NULL DEFAULT '{}',
  strengths text[] NOT NULL DEFAULT '{}',
  cofounder_style text NOT NULL DEFAULT 'strategic-partner',
  last_insight text,
  insight_history jsonb NOT NULL DEFAULT '[]',
  -- CoFounder Core additions
  validation_receipts jsonb NOT NULL DEFAULT '[]',
  competitor_history jsonb NOT NULL DEFAULT '[]',
  -- Legacy fields retained for backward compatibility (not used by TS type)
  startup_summary text,
  founding_story text,
  core_motivations text[],
  last_updated_batch_count int DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE founder_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY founder_memory_own_data ON founder_memory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY founder_memory_update_own ON founder_memory FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY founder_memory_insert_own ON founder_memory FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER founder_memory_updated_at BEFORE UPDATE ON founder_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: founder_context (momentum engine — context for decisions)
-- ============================================================================
CREATE TABLE founder_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  startup_summary text,
  current_stage text,
  momentum_score int2 NOT NULL DEFAULT 50 CHECK (momentum_score >= 0 AND momentum_score <= 100),
  momentum_updated_at timestamptz NOT NULL DEFAULT now(),
  avoidance_signals text[] NOT NULL DEFAULT '{}',
  topics_mentioned_repeatedly text[] NOT NULL DEFAULT '{}',
  override_reasons text[] NOT NULL DEFAULT '{}',
  breakthrough_moments text[] NOT NULL DEFAULT '{}',
  last_active date,
  days_inactive int2 NOT NULL DEFAULT 0,
  tasks_accepted_this_week int2 NOT NULL DEFAULT 0,
  tasks_overridden_this_week int2 NOT NULL DEFAULT 0,
  consecutive_tasks_completed int2 NOT NULL DEFAULT 0,
  cognitive_load text NOT NULL DEFAULT 'fresh' CHECK (cognitive_load IN ('fresh','drained','autopilot')),
  cognitive_pattern text,
  competitor_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  pattern_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  timezone_offset int2 NOT NULL DEFAULT 0,
  morning_briefing_hour int2 NOT NULL DEFAULT 7,
  evening_check_hour int2 NOT NULL DEFAULT 18,
  recovery_mode_active boolean NOT NULL DEFAULT false,
  reset_mission_active boolean NOT NULL DEFAULT false,
  reset_mission_text text,
  reset_mission_complete boolean NOT NULL DEFAULT false,
  last_re_engagement_email_at timestamptz,           -- tracks re-engagement email sends to prevent double-sending
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE founder_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY founder_context_own_data ON founder_context FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY founder_context_update_own ON founder_context FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY founder_context_insert_own ON founder_context FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER founder_context_updated_at BEFORE UPDATE ON founder_context FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: morning_briefings (scheduled job output — morning insights)
-- ============================================================================
CREATE TABLE morning_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  win text,
  risk text,
  action text,
  delivered_at timestamp,
  created_at timestamp DEFAULT now()
);

ALTER TABLE morning_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY morning_briefings_own_data ON morning_briefings FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX morning_briefings_user_delivered ON morning_briefings(user_id, delivered_at DESC);

-- ============================================================================
-- TABLE: evening_checks (scheduled job output — task completion tracking)
-- ============================================================================
CREATE TABLE evening_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_completed boolean DEFAULT false,
  nudge_sent boolean DEFAULT false,
  nudge_text text,
  momentum_before int,
  momentum_after int,
  created_at timestamp DEFAULT now()
);

ALTER TABLE evening_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY evening_checks_own_data ON evening_checks FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX evening_checks_user_day ON evening_checks(user_id, DATE(created_at) DESC);

-- ============================================================================
-- TABLE: scheduled_job_log (audit trail for cron jobs)
-- ============================================================================
CREATE TABLE scheduled_job_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('success', 'error', 'pending')),
  detail text,
  created_at timestamp DEFAULT now()
);

ALTER TABLE scheduled_job_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheduled_job_log_own_data ON scheduled_job_log FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX scheduled_job_log_job_name ON scheduled_job_log(job_name, created_at DESC);

-- ============================================================================
-- TABLE: projects (project management)
-- ============================================================================
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  priority int DEFAULT 5,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_own_data ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY projects_update_own ON projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY projects_insert_own ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEW: project_summaries (required by app/reflect/page.tsx)
-- Backported from migration 20260513000000_project_summaries_view.sql
-- Must be placed after the projects table definition.
-- ============================================================================
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
-- TABLE: milestones (project milestones)
-- ============================================================================
CREATE TABLE milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_date date,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'abandoned')),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY milestones_own_data ON milestones FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY milestones_update_own ON milestones FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY milestones_insert_own ON milestones FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER milestones_updated_at BEFORE UPDATE ON milestones FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: tasks (task management)
-- ============================================================================
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid REFERENCES milestones(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date date,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  priority int DEFAULT 5,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_own_data ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY tasks_update_own ON tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY tasks_insert_own ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: reflections (daily reflection captures)
-- ============================================================================
CREATE TABLE reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  today_action text,
  outcome text CHECK (outcome IN ('completed', 'partial', 'abandoned', 'blocked', 'learned')),
  confidence int2 CHECK (confidence >= 1 AND confidence <= 5),
  note text,               -- short-form note (used by reflect-action route)
  reflection_notes text,   -- long-form notes (legacy column, kept for compatibility)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY reflections_own_data ON reflections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY reflections_update_own ON reflections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY reflections_insert_own ON reflections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER reflections_updated_at BEFORE UPDATE ON reflections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: notifications (in-app notification system)
-- ============================================================================
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_own_data ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY notifications_update_own ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE INDEX notifications_user_unread ON notifications(user_id, is_read) WHERE NOT is_read;
CREATE TRIGGER notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: push_subscriptions (Web Push API subscriptions)
-- ============================================================================
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription jsonb NOT NULL,
  user_agent text,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_own_data ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY push_subscriptions_insert_own ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY push_subscriptions_delete_own ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- FIXED: Use separate unique index instead of inline JSONB expression
CREATE UNIQUE INDEX push_subscriptions_user_endpoint ON push_subscriptions (user_id, (subscription->>'endpoint'));

CREATE TRIGGER push_subscriptions_updated_at BEFORE UPDATE ON push_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: execution_scorecards (performance reporting)
-- ============================================================================
CREATE TABLE execution_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_starting date NOT NULL,
  tasks_planned int,
  tasks_completed int,
  completion_rate numeric(5,2),
  momentum_start int,
  momentum_end int,
  key_blockers text[],
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE execution_scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY execution_scorecards_own_data ON execution_scorecards FOR SELECT USING (auth.uid() = user_id);
CREATE TRIGGER execution_scorecards_updated_at BEFORE UPDATE ON execution_scorecards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: ai_usage (feature tracking and AI call accounting)
-- ============================================================================
CREATE TABLE ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL,
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(8,6),
  created_at timestamp DEFAULT now()
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_own_data ON ai_usage FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX ai_usage_user_feature ON ai_usage(user_id, feature, created_at DESC);

-- ============================================================================
-- TABLE: ventures_blueprints (AI-generated venture boards)
-- ============================================================================
CREATE TABLE ventures_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venture_idea text NOT NULL,
  blueprint jsonb,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'saved', 'archived')),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE ventures_blueprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY ventures_blueprints_own_data ON ventures_blueprints FOR SELECT USING (auth.uid() = user_id);
CREATE TRIGGER ventures_blueprints_updated_at BEFORE UPDATE ON ventures_blueprints FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: cofounder_reframe_log (rate limiting for AI cofounder reframes)
-- ============================================================================
CREATE TABLE cofounder_reframe_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reframe_count int DEFAULT 1,
  last_reframe_at timestamp DEFAULT now(),
  reset_at timestamp,
  created_at timestamp DEFAULT now()
);

ALTER TABLE cofounder_reframe_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY cofounder_reframe_log_own_data ON cofounder_reframe_log FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- TABLE: waitlist (early access registration)
-- ============================================================================
CREATE TABLE waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text,
  startup_idea text,
  referral_source text,
  created_at timestamp DEFAULT now()
);

-- ============================================================================
-- TABLE: reflexion_quality_log (gatekeeper verdict ledger)
-- ============================================================================
CREATE TABLE reflexion_quality_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id      uuid        REFERENCES projects(id) ON DELETE SET NULL,
  context         text,
  verdict         text        NOT NULL CHECK (verdict IN ('pass', 'fail')),
  reject_reason   text,
  original_output text,
  final_output    text,
  stage           text,
  momentum_score  int2,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reflexion_quality_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reflexion_quality_self_read" ON reflexion_quality_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "reflexion_quality_service_insert" ON reflexion_quality_log
  FOR INSERT WITH CHECK (true);
CREATE INDEX reflexion_quality_verdict_idx ON reflexion_quality_log (verdict, created_at DESC);
CREATE INDEX reflexion_quality_user_idx ON reflexion_quality_log (user_id, created_at DESC);

-- ============================================================================
-- TABLE: users (public mirror of auth.users — onboarding state + plan)
-- Separate from profiles to avoid breaking existing queries in lib/data/projects.ts
-- ============================================================================
CREATE TABLE users (
  id                   uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                text,
  plan                 text        NOT NULL DEFAULT 'free',
  onboarding_completed boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_self_only" ON users FOR ALL
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: feed_events (public activity feed — anonymised, no PII)
-- ============================================================================
CREATE TABLE feed_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  flag        text        NOT NULL DEFAULT '🌍',
  location    text        NOT NULL DEFAULT 'Somewhere',
  stage       text        NOT NULL DEFAULT 'Idea',
  stage_color text        NOT NULL DEFAULT '#6366f1',
  action      text,
  outcome     text,
  streak      int2        NOT NULL DEFAULT 0,
  type        text        NOT NULL DEFAULT 'done'
    CHECK (type IN ('done', 'streak', 'reflect', 'launch')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feed_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feed_events_public_read" ON feed_events FOR SELECT USING (true);
CREATE POLICY "feed_events_service_insert" ON feed_events FOR INSERT WITH CHECK (true);
CREATE INDEX feed_events_created_at_idx ON feed_events (created_at DESC);

-- ============================================================================
-- TABLE: task_overrides (override/skip log — read by pattern extractor)
-- ============================================================================
CREATE TABLE task_overrides (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason     text        NOT NULL DEFAULT 'not specified',
  task_text  text,
  stage      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_overrides_self_only" ON task_overrides FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX task_overrides_user_created_idx ON task_overrides (user_id, created_at DESC);

-- ============================================================================
-- VERIFICATION QUERIES (run these to verify setup)
-- ============================================================================
-- Check all tables created:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' ORDER BY table_name;

-- Check all RLS policies:
-- SELECT schemaname, tablename, policyname FROM pg_policies 
-- WHERE schemaname = 'public' ORDER BY tablename, policyname;

-- Check trigger functions:
-- SELECT trigger_name, event_object_table FROM information_schema.triggers 
-- WHERE event_object_schema = 'public' ORDER BY event_object_table;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables added after initial schema — appended by audit fix (session 4)
-- ─────────────────────────────────────────────────────────────────────────────

-- ai_usage_daily (from migration 20260515000000_daily_ai_cap.sql)
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date     date        NOT NULL DEFAULT current_date,
  count    integer     NOT NULL DEFAULT 0,
  CONSTRAINT ai_usage_daily_user_date_key UNIQUE (user_id, date)
);
ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_daily_read_own ON ai_usage_daily
  FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_user_date
  ON ai_usage_daily(user_id, date DESC);

-- ip_rate_limits (from migration 20260510000000_ip_rate_limits.sql)
CREATE TABLE IF NOT EXISTS ip_rate_limits (
  key          text        NOT NULL,
  window_start bigint      NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- reflexion_learning_log (from migration 20260507000000_reflexion_learning_log.sql)
CREATE TABLE IF NOT EXISTS reflexion_learning_log (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id          text,
  session_id          text          NOT NULL,
  stage               text          NOT NULL DEFAULT 'Idea',
  action_shown        text          NOT NULL,
  action_type         text,
  action_platform     text,
  critic_persona      text,
  viability_score     integer,
  confidence          numeric(4,3),
  outcome             text,
  created_at          timestamptz   NOT NULL DEFAULT now()
);
ALTER TABLE reflexion_learning_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY reflexion_learning_log_self ON reflexion_learning_log
  FOR ALL USING (auth.uid() = user_id);

-- venture_tracks (from migration 20260504000000_venture_tracks.sql)
CREATE TABLE IF NOT EXISTS venture_tracks (
  id          text          PRIMARY KEY,
  user_id     uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);
ALTER TABLE venture_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY venture_tracks_self_only ON venture_tracks
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- testimonials (from migration 20260514000000_testimonials.sql)
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
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
CREATE POLICY testimonials_public_read ON testimonials
  FOR SELECT USING (is_public = true);
CREATE POLICY testimonials_own_read ON testimonials
  FOR SELECT USING (auth.uid() = user_id);

-- funnel_events (from migration 20260517000004_funnel_events.sql)
CREATE TABLE IF NOT EXISTS funnel_events (
  id         bigserial    PRIMARY KEY,
  user_id    uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  step       text         NOT NULL,
  meta       jsonb,
  session_id text,
  referrer   text,
  user_agent text,
  created_at timestamptz  NOT NULL DEFAULT now()
);
ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_funnel_events_step_created
  ON funnel_events (step, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_events_user_id
  ON funnel_events (user_id, created_at ASC)
  WHERE user_id IS NOT NULL;
CREATE POLICY funnel_events_insert_authenticated ON funnel_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY funnel_events_insert_anon ON funnel_events
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);
CREATE POLICY funnel_events_no_select ON funnel_events
  FOR SELECT TO authenticated
  USING (false);
