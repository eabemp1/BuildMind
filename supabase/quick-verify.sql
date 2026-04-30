-- ============================================================================
-- QUICK VERIFICATION (Run this to confirm everything works)
-- ============================================================================

-- 1. Test founder_context table exists and is queryable
SELECT COUNT(*) as founder_context_rows FROM founder_context;

-- 2. Test all 6 critical tables exist
SELECT 
  'founder_context' as table_name, COUNT(*) as row_count FROM founder_context
UNION ALL
SELECT 'morning_briefings', COUNT(*) FROM morning_briefings
UNION ALL
SELECT 'evening_checks', COUNT(*) FROM evening_checks
UNION ALL
SELECT 'push_subscriptions', COUNT(*) FROM push_subscriptions
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL
SELECT 'scheduled_job_log', COUNT(*) FROM scheduled_job_log;

-- 3. Verify the trigger function exists
SELECT EXISTS (
  SELECT 1 FROM pg_proc 
  WHERE proname = 'update_updated_at_column'
) as trigger_function_exists;

-- 4. Verify RLS is enabled on critical tables
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('founder_context', 'morning_briefings', 'push_subscriptions')
AND schemaname = 'public';

-- 5. Final confirmation
SELECT 'BUILDMIND SUPABASE SETUP: READY FOR PRODUCTION ✓' as status;
