-- ============================================================================
-- DIAGNOSTIC QUERIES: Check what exists in your Supabase database
-- ============================================================================

-- 1. Check all PUBLIC tables exist
SELECT 
  table_name
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 2. Check all RLS policies
SELECT schemaname, tablename, policyname, QUAL
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. Check all trigger functions
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers 
WHERE event_object_schema = 'public'
ORDER BY event_object_table;

-- 4. Check extensions
SELECT extname, extversion 
FROM pg_extension 
WHERE extname IN ('pgcrypto', 'pg_cron', 'pg_net');

-- 5. Check if auth.users table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'auth' 
  AND table_name = 'users'
) as auth_users_exists;
