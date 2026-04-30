-- ============================================================================
-- BuildMind Minimal Schema - Start Fresh
-- This version creates ONLY the essential tables needed for cron jobs to work
-- Run this to get a working foundation, then add more tables as needed
-- ============================================================================

-- 1. Enable extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Drop ALL tables and functions to start completely fresh
-- (Comment out if you want to preserve existing data)
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

DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- 3. Create utility function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CRITICAL TABLES FOR SCHEDULED JOBS (must exist or cron jobs will fail)
-- ============================================================================

-- founder_context: Required by morning_briefing, evening_check, weekly_mirror jobs
CREATE TABLE founder_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  startup_summary text,
  current_stage text,
  momentum_score int DEFAULT 50,
  avoidance_signals text[],
  topics_mentioned_repeatedly text[],
  last_active date,
  days_inactive int DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE founder_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY founder_context_select ON founder_context FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY founder_context_insert ON founder_context FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY founder_context_update ON founder_context FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER founder_context_set_updated_at BEFORE UPDATE ON founder_context 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- morning_briefings: Output table for morning_briefing job
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
CREATE POLICY morning_briefings_select ON morning_briefings FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_morning_briefings_user ON morning_briefings(user_id);

-- evening_checks: Output table for evening_check job
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
CREATE POLICY evening_checks_select ON evening_checks FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_evening_checks_user ON evening_checks(user_id);

-- scheduled_job_log: Audit trail for all cron job executions
CREATE TABLE scheduled_job_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status text CHECK (status IN ('success', 'error', 'pending')),
  detail text,
  created_at timestamp DEFAULT now()
);

ALTER TABLE scheduled_job_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY scheduled_job_log_select ON scheduled_job_log FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_scheduled_job_log_name ON scheduled_job_log(job_name);

-- push_subscriptions: For Web Push notifications from cron jobs
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
CREATE POLICY push_subscriptions_select ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY push_subscriptions_insert ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY push_subscriptions_delete ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);
CREATE UNIQUE INDEX idx_push_subscriptions_endpoint ON push_subscriptions (user_id, (subscription->>'endpoint'));
CREATE TRIGGER push_subscriptions_set_updated_at BEFORE UPDATE ON push_subscriptions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- notifications: For in-app notifications from cron jobs
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
CREATE POLICY notifications_select ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY notifications_update ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE NOT is_read;
CREATE TRIGGER notifications_set_updated_at BEFORE UPDATE ON notifications 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SUPPORTING TABLES FOR COMPLETE FUNCTIONALITY
-- ============================================================================

-- profiles: User profile data
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
CREATE POLICY profiles_select ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- founder_memory: Core identity storage
CREATE TABLE founder_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  startup_summary text,
  founding_story text,
  core_motivations text[],
  personality_profile jsonb,
  validation_receipts jsonb[] DEFAULT '{}',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE founder_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY founder_memory_select ON founder_memory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY founder_memory_insert ON founder_memory FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY founder_memory_update ON founder_memory FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER founder_memory_set_updated_at BEFORE UPDATE ON founder_memory 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- projects: Project management
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text DEFAULT 'active',
  priority int DEFAULT 5,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_select ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY projects_insert ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY projects_update ON projects FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON projects 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- milestones: Project milestones
CREATE TABLE milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_date date,
  status text DEFAULT 'pending',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY milestones_select ON milestones FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY milestones_insert ON milestones FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY milestones_update ON milestones FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER milestones_set_updated_at BEFORE UPDATE ON milestones 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- tasks: Individual tasks
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid REFERENCES milestones(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date date,
  status text DEFAULT 'pending',
  priority int DEFAULT 5,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tasks_select ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY tasks_insert ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY tasks_update ON tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON tasks 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- reflections: Daily reflection data
CREATE TABLE reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  today_action text,
  outcome text,
  confidence int,
  reflection_notes text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;
CREATE POLICY reflections_select ON reflections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY reflections_insert ON reflections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY reflections_update ON reflections FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER reflections_set_updated_at BEFORE UPDATE ON reflections 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- execution_scorecards: Performance reporting
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
CREATE POLICY execution_scorecards_select ON execution_scorecards FOR SELECT USING (auth.uid() = user_id);
CREATE TRIGGER execution_scorecards_set_updated_at BEFORE UPDATE ON execution_scorecards 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ai_usage: Track AI feature usage
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
CREATE POLICY ai_usage_select ON ai_usage FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_ai_usage_user ON ai_usage(user_id, feature);

-- ventures_blueprints: AI-generated venture ideas
CREATE TABLE ventures_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venture_idea text NOT NULL,
  blueprint jsonb,
  status text DEFAULT 'draft',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE ventures_blueprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY ventures_blueprints_select ON ventures_blueprints FOR SELECT USING (auth.uid() = user_id);
CREATE TRIGGER ventures_blueprints_set_updated_at BEFORE UPDATE ON ventures_blueprints 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- cofounder_reframe_log: Rate limiting for reframes
CREATE TABLE cofounder_reframe_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reframe_count int DEFAULT 1,
  last_reframe_at timestamp DEFAULT now(),
  reset_at timestamp,
  created_at timestamp DEFAULT now()
);

ALTER TABLE cofounder_reframe_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY cofounder_reframe_log_select ON cofounder_reframe_log FOR SELECT USING (auth.uid() = user_id);

-- waitlist: Early access registration
CREATE TABLE waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text,
  startup_idea text,
  referral_source text,
  created_at timestamp DEFAULT now()
);

-- ============================================================================
-- SUCCESS VERIFICATION
-- ============================================================================
SELECT 'Schema creation COMPLETE ✓' as result,
       (SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE') as tables_created;
