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
