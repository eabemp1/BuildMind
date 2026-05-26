-- Migration: 20260524000001_audit_fixes.sql
-- Applies fixes from the May 2026 principal systems architect audit.
--
-- Changes:
--   1. append_avoidance_zone() RPC  — E1 fix: atomic array append for founder_memory
--   2. append_strength() RPC        — E1 fix: atomic array append for founder_memory
--   3. reflexion_learning_log TTL   — C3 fix: 90-day cleanup via pg_cron
--   4. safe_decrement_ai_usage_daily_fallback() — B2 fix: atomic decrement with GREATEST
--   5. processed_webhooks index     — E3 fix: explicit index on (provider, event_key)

-- ── 1 & 2. Atomic founder_memory array append RPCs (E1 fix) ─────────────────
-- Replaces the read-modify-write pattern in lib/founderMemory.ts observeTaskEvent().
-- Two simultaneous task completions previously raced: both read the same memory
-- state, computed different updates, and the later write silently discarded the
-- earlier one. These functions mutate in a single UPDATE, preventing clobbering.

CREATE OR REPLACE FUNCTION append_avoidance_zone(
  p_user_id  uuid,
  p_zone     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current text[];
  v_new     text[];
BEGIN
  SELECT COALESCE(avoidance_zones, ARRAY[]::text[])
    INTO v_current
    FROM founder_memory
   WHERE user_id = p_user_id;

  -- Skip if already present (case-insensitive check)
  IF EXISTS (
    SELECT 1 FROM unnest(v_current) AS z WHERE lower(z) = lower(p_zone)
  ) THEN
    RETURN;
  END IF;

  -- Append and cap at 10 items (oldest items dropped from the front)
  v_new := array_append(v_current, p_zone);
  IF array_length(v_new, 1) > 10 THEN
    v_new := v_new[array_length(v_new, 1) - 9 : array_length(v_new, 1)];
  END IF;

  UPDATE founder_memory
     SET avoidance_zones = v_new,
         updated_at      = now()
   WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION append_strength(
  p_user_id  uuid,
  p_strength text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current text[];
  v_new     text[];
BEGIN
  SELECT COALESCE(strengths, ARRAY[]::text[])
    INTO v_current
    FROM founder_memory
   WHERE user_id = p_user_id;

  IF EXISTS (
    SELECT 1 FROM unnest(v_current) AS s WHERE lower(s) = lower(p_strength)
  ) THEN
    RETURN;
  END IF;

  v_new := array_append(v_current, p_strength);
  IF array_length(v_new, 1) > 10 THEN
    v_new := v_new[array_length(v_new, 1) - 9 : array_length(v_new, 1)];
  END IF;

  UPDATE founder_memory
     SET strengths  = v_new,
         updated_at = now()
   WHERE user_id = p_user_id;
END;
$$;

-- ── 3. reflexion_learning_log TTL cleanup (C3 fix) ───────────────────────────
-- Without a cleanup job, reflexion_learning_log grows unbounded (~365 rows/user/year).
-- The compound index (added in 20260511000000_performance_indexes.sql) makes
-- per-user queries fast, but the table size still grows. Schedule a nightly
-- purge of rows older than 90 days. Adjust the interval as needed.

DO $reflexion_ttl$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Remove any existing schedule for this job to allow idempotent re-runs
    PERFORM cron.unschedule('reflexion_learning_log_cleanup')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'reflexion_learning_log_cleanup'
      );

    PERFORM cron.schedule(
      'reflexion_learning_log_cleanup',
      '30 2 * * *',   -- 02:30 UTC daily
      $$DELETE FROM reflexion_learning_log
          WHERE created_at < now() - interval '90 days'$$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — reflexion_learning_log TTL cleanup not scheduled. '
                 'Run manually: DELETE FROM reflexion_learning_log WHERE created_at < now() - interval ''90 days''';
  END IF;
END;
$reflexion_ttl$;

-- ── 4. safe_decrement_ai_usage_daily_fallback() (B2 fix) ─────────────────────
-- The original fallback used Number(dailyCount) - 1, where dailyCount was read
-- before a concurrent request could have changed it. This function evaluates
-- GREATEST(count - 1, 0) atomically in the DB, which is always safe.

CREATE OR REPLACE FUNCTION safe_decrement_ai_usage_daily_fallback(
  p_user_id uuid,
  p_date    date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ai_usage_daily
     SET count = GREATEST(count - 1, 0)
   WHERE user_id = p_user_id
     AND date    = p_date;
END;
$$;

-- ── 5. processed_webhooks explicit index (E3 fix) ────────────────────────────
-- The UNIQUE constraint on (provider, event_key) creates an implicit index, but
-- an explicit named index makes the constraint enforcer path clear and allows
-- pg_stat_user_indexes monitoring. Also add a created_at index for TTL range scans.

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_lookup
  ON processed_webhooks (provider, event_key);

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_created_at
  ON processed_webhooks (processed_at);

-- ── 6. processed_webhooks TTL cleanup (E3 fix) ───────────────────────────────
-- The processed_webhooks table had an index (added above) but no cleanup job.
-- At 10,000 active users generating 2 billing events/month each, it grows by
-- ~20,000 rows/month indefinitely. Idempotency keys older than 90 days are
-- safe to purge — Paystack's documented retry window is under 72 hours.

DO $webhooks_ttl$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule('processed_webhooks_cleanup')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'processed_webhooks_cleanup'
      );

    PERFORM cron.schedule(
      'processed_webhooks_cleanup',
      '45 2 * * *',   -- 02:45 UTC daily (15 min after reflexion log cleanup)
      $$DELETE FROM processed_webhooks
          WHERE processed_at < now() - interval '90 days'$$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — processed_webhooks TTL cleanup not scheduled. '
                 'Run manually: DELETE FROM processed_webhooks WHERE processed_at < now() - interval ''90 days''';
  END IF;
END;
$webhooks_ttl$;
