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
