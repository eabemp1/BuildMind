-- ============================================================================
-- SCHEDULE BUILDMIND CRON JOBS (pg_cron)
-- Run this AFTER schema-verify-and-init.sql completes successfully
-- ============================================================================

-- IMPORTANT: Replace these with your actual values if different:
-- Project URL: https://YOUR_PROJECT_REF.supabase.co
-- CRON_SECRET: <your CRON_SECRET (same value set in the scheduled-jobs function env var)>
--
-- NOTE (timezone): These cron expressions run in UTC. Ghana (Africa/Accra) is UTC+0,
-- so "5 AM UTC" is also "5 AM Ghana time".
--
-- NOTE (idempotency): This script unschedules any existing jobs with the same names
-- before re-scheduling them.

-- ============================================================================
-- CLEANUP: Unschedule existing jobs (safe to re-run)
-- ============================================================================
DO $$
DECLARE jid integer;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'morning-briefing';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;

  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'evening-check';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;

  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'weekly-mirror';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;

  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'daily-push';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

-- ============================================================================
-- JOB 1: MORNING BRIEFING (5 AM UTC)
-- ============================================================================
SELECT cron.schedule(
  'morning-briefing',
  '0 5 * * *',
  $$ SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/scheduled-jobs',
    headers := '{"Content-Type":"application/json","x-job-secret":"YOUR_CRON_SECRET"}'::jsonb,
    body := '{"job":"morning_briefing"}'::jsonb
  ) $$
);

-- ============================================================================
-- JOB 2: EVENING CHECK (4 PM UTC)
-- ============================================================================
SELECT cron.schedule(
  'evening-check',
  '0 16 * * *',
  $$ SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/scheduled-jobs',
    headers := '{"Content-Type":"application/json","x-job-secret":"YOUR_CRON_SECRET"}'::jsonb,
    body := '{"job":"evening_check"}'::jsonb
  ) $$
);

-- ============================================================================
-- JOB 3: WEEKLY MIRROR (6 PM UTC Sunday)
-- ============================================================================
SELECT cron.schedule(
  'weekly-mirror',
  '0 18 * * 0',
  $$ SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/scheduled-jobs',
    headers := '{"Content-Type":"application/json","x-job-secret":"YOUR_CRON_SECRET"}'::jsonb,
    body := '{"job":"weekly_mirror"}'::jsonb
  ) $$
);

-- ============================================================================
-- JOB 4: DAILY PUSH NOTIFICATIONS (6 AM UTC)
-- ============================================================================
SELECT cron.schedule(
  'daily-push',
  '0 6 * * *',
  $$ SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-push',
    headers := '{"Content-Type":"application/json","x-job-secret":"YOUR_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  ) $$
);

-- ============================================================================
-- VERIFICATION: Show all scheduled jobs
-- ============================================================================
SELECT 
  jobid,
  jobname,
  schedule,
  active
FROM cron.job
ORDER BY jobname;

-- ============================================================================
-- MONITORING: Query execution log
-- ============================================================================
-- Use this to monitor cron job execution:
-- SELECT job_name, status, user_id, detail, created_at FROM scheduled_job_log ORDER BY created_at DESC;

-- ============================================================================
-- RESULT
-- ============================================================================
SELECT 'All 4 cron jobs scheduled ✓' as result,
       'Monitor with: SELECT * FROM scheduled_job_log ORDER BY created_at DESC;' as monitoring_query;
