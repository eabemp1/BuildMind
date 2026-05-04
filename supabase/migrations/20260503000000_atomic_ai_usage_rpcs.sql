-- Migration: 20260503000000_atomic_ai_usage_rpcs.sql
--
-- Adds two Postgres RPCs that atomically increment the ai_usage counter,
-- replacing the SELECT + UPDATE pattern that had a race condition.
--
-- Why this matters:
--   The old code read the count, checked it, then wrote it back — two
--   separate round-trips. Two concurrent tab requests could both read the
--   same count (e.g. 29) and both conclude they're under the 30-call limit,
--   effectively allowing 31+ calls. The RPC fixes this with a single
--   atomic UPDATE ... RETURNING that Postgres serialises safely.
--
-- increment_ai_usage(p_user_id, p_month)
--   Upserts a row and increments count. No cap. Returns new count.
--   Used for Builder/Venture unlimited plans (just tracking).
--
-- increment_ai_usage_capped(p_user_id, p_month, p_limit)
--   Atomically increments ONLY if current count < p_limit.
--   Returns the new count on success, or -1 if the cap is already reached.
--   Used for Free plan enforcement.

-- ── Uncapped increment (unlimited plans) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_user_id uuid,
  p_month   text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count integer;
BEGIN
  INSERT INTO ai_usage (user_id, month, count)
    VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month)
    DO UPDATE SET count = ai_usage.count + 1
  RETURNING count INTO v_new_count;

  RETURN v_new_count;
END;
$$;

-- ── Capped increment (free plan) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_ai_usage_capped(
  p_user_id uuid,
  p_month   text,
  p_limit   integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current integer := 0;
  v_new_count integer;
BEGIN
  -- Ensure a row exists so we can lock it.
  INSERT INTO ai_usage (user_id, month, count)
    VALUES (p_user_id, p_month, 0)
  ON CONFLICT (user_id, month) DO NOTHING;

  -- Read current count with a row-level lock so concurrent calls queue up
  -- behind each other rather than racing.
  SELECT count INTO v_current
    FROM ai_usage
   WHERE user_id = p_user_id AND month = p_month
     FOR UPDATE;

  -- If already at or over the limit, return the sentinel value -1.
  IF v_current >= p_limit THEN
    RETURN -1;
  END IF;

  -- Safe to increment.
  UPDATE ai_usage
     SET count = count + 1
   WHERE user_id = p_user_id AND month = p_month
  RETURNING count INTO v_new_count;

  RETURN v_new_count;
END;
$$;

-- Grant execute to the service role used by createAdminClient().
GRANT EXECUTE ON FUNCTION increment_ai_usage(uuid, text)          TO service_role;
GRANT EXECUTE ON FUNCTION increment_ai_usage_capped(uuid, text, integer) TO service_role;

-- Ensure the unique constraint exists so ON CONFLICT works correctly.
-- (It should already exist from prior migrations, but this is idempotent.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ai_usage_user_id_month_key'
  ) THEN
    ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_user_id_month_key UNIQUE (user_id, month);
  END IF;
END;
$$;
