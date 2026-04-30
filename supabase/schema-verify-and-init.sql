-- ============================================================================
-- BUILDMIND SETUP VERIFICATION & INITIALIZATION
-- Run this script to complete your Supabase setup
-- ============================================================================

-- SECTION 1: Verify all 19 tables exist
-- ============================================================================
SELECT 'VERIFICATION: All tables created' as step;
SELECT 
  table_name,
  CASE 
    WHEN table_name IN ('founder_context', 'morning_briefings', 'evening_checks', 'push_subscriptions', 'notifications', 'scheduled_job_log')
    THEN '(CRITICAL)'
    ELSE '(supporting)'
  END as type
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- SECTION 2: Insert test founder_context data (for cron jobs to process)
-- ============================================================================
SELECT 'STEP 1: Insert test data into founder_context' as step;

-- This assumes you have at least one user in auth.users
-- If this fails, create a test user first in Supabase Auth settings
INSERT INTO founder_context (user_id, startup_summary, current_stage, momentum_score, avoidance_signals, topics_mentioned_repeatedly)
SELECT 
  id as user_id,
  'BuildMind - AI-powered founder OS for decision clarity' as startup_summary,
  'Growth' as current_stage,
  85 as momentum_score,
  ARRAY['perfectionism', 'analysis paralysis'] as avoidance_signals,
  ARRAY['founder memory', 'momentum', 'AI insights'] as topics_mentioned_repeatedly
FROM auth.users 
WHERE NOT EXISTS (SELECT 1 FROM founder_context WHERE founder_context.user_id = auth.users.id)
LIMIT 1;

-- Verify data was inserted
SELECT COUNT(*) as founder_contexts_in_db FROM founder_context;
SELECT user_id, startup_summary, momentum_score FROM founder_context LIMIT 1;

-- SECTION 3: Test table connectivity
-- ============================================================================
SELECT 'STEP 2: Test all critical tables are accessible' as step;

SELECT 'founder_context' as table_name, COUNT(*) as row_count FROM founder_context
UNION ALL
SELECT 'morning_briefings', COUNT(*) FROM morning_briefings
UNION ALL
SELECT 'evening_checks', COUNT(*) FROM evening_checks
UNION ALL
SELECT 'scheduled_job_log', COUNT(*) FROM scheduled_job_log
UNION ALL
SELECT 'push_subscriptions', COUNT(*) FROM push_subscriptions
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications;

-- SECTION 4: Verify RLS policies are enabled
-- ============================================================================
SELECT 'STEP 3: Verify Row Level Security policies' as step;

SELECT 
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- SECTION 5: Verify trigger functions exist
-- ============================================================================
SELECT 'STEP 4: Verify trigger functions' as step;

SELECT 
  trigger_name,
  event_object_table
FROM information_schema.triggers
WHERE event_object_schema = 'public'
ORDER BY event_object_table;

-- SECTION 6: Verify extensions are enabled
-- ============================================================================
SELECT 'STEP 5: Verify required extensions' as step;

SELECT extname, extversion FROM pg_extension 
WHERE extname IN ('pgcrypto', 'pg_cron', 'pg_net')
ORDER BY extname;

-- SECTION 7: Check for existing cron jobs
-- ============================================================================
SELECT 'STEP 6: Check scheduled cron jobs' as step;

SELECT 
  jobid,
  jobname,
  schedule,
  command
FROM cron.job
ORDER BY jobname;

-- ============================================================================
-- FINAL STATUS
-- ============================================================================
SELECT 'SETUP COMPLETE ✓' as final_status,
       NOW() as completed_at,
       'Next: Schedule cron jobs with pg_cron (see SQL file)' as next_steps;
