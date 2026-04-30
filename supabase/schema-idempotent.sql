-- ============================================================================
-- BuildMind Complete Schema - IDEMPOTENT VERSION
-- Safe to run multiple times without errors
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
DROP TABLE IF EXISTS waitlist CASCADE;
DROP TABLE IF EXISTS cofounder_reframe_log CASCADE;
DROP TABLE IF EXISTS ai_usage CASCADE;
DROP TABLE IF EXISTS execution_scorecards CASCADE;
DROP TABLE IF EXISTS ventures_blueprints CASCADE;
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
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
-- TABLE: founder_memory (core identity storage — replaces CodEx)
-- ============================================================================
CREATE TABLE founder_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  startup_summary text,
  founding_story text,
  core_motivations text[],
  personality_profile jsonb,
  validation_receipts jsonb[] DEFAULT '{}',
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
  momentum_score int DEFAULT 50 CHECK (momentum_score >= 0 AND momentum_score <= 100),
  avoidance_signals text[],
  topics_mentioned_repeatedly text[],
  last_active date,
  days_inactive int DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
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
  today_action text,
  outcome text CHECK (outcome IN ('completed', 'partial', 'abandoned', 'blocked')),
  confidence int CHECK (confidence >= 1 AND confidence <= 5),
  reflection_notes text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
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
