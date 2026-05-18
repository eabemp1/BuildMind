-- Migration: 20260515000000_daily_ai_cap.sql
--
-- Adds per-day AI usage tracking for free users so a single heavy session
-- cannot consume the entire monthly quota in one day.
--
-- Design:
--   - ai_usage_daily table mirrors ai_usage but keyed by (user_id, date).
--   - increment_ai_usage_daily_capped RPC atomically increments and enforces
--     the daily cap in one round-trip (same SELECT FOR UPDATE pattern as the
--     monthly RPC to prevent race conditions).
--   - Builder plan: daily table is updated for tracking but no cap is enforced
--     (same unlimited behaviour as the monthly table).
--   - Free plan: capped at FREE_DAILY_AI_LIMIT (3 calls/day by default).
--     This means a free user can open /today up to 3 times in a day and get
--     a full Reflexion response. On the 4th call they receive a 429 with an
--     upgrade prompt.
--
-- The daily limit (3) × 30 days = 90 potential calls, which is intentionally
-- above the monthly cap (30) so that the monthly cap remains the binding
-- constraint for light daily users while preventing burst abuse.

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date      date        NOT NULL DEFAULT CURRENT_DATE,
  count     integer     NOT NULL DEFAULT 0 CHECK (count >= 0),
  CONSTRAINT ai_usage_daily_user_date_key UNIQUE (user_id, date)
);

ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;

-- Users can read their own daily usage (for the usage badge in the UI)
DROP POLICY IF EXISTS ai_usage_daily_read_own ON ai_usage_daily;
CREATE POLICY ai_usage_daily_read_own ON ai_usage_daily
  FOR SELECT USING (auth.uid() = user_id);

-- No client writes — all writes go through the service_role RPC
CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_user_date
  ON ai_usage_daily(user_id, date DESC);

-- ── Capped daily increment ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_ai_usage_daily_capped(
  p_user_id  uuid,
  p_date     date,
  p_limit    integer   -- pass -1 for unlimited (builder)
)
RETURNS integer        -- new count, or -1 if cap already reached
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current   integer := 0;
  v_new_count integer;
BEGIN
  -- Short-circuit for unlimited plans (Builder) — just track
  IF p_limit = -1 THEN
    INSERT INTO ai_usage_daily (user_id, date, count)
      VALUES (p_user_id, p_date, 1)
    ON CONFLICT (user_id, date)
      DO UPDATE SET count = ai_usage_daily.count + 1
    RETURNING count INTO v_new_count;
    RETURN v_new_count;
  END IF;

  -- Free plan: ensure row exists, then lock and check
  INSERT INTO ai_usage_daily (user_id, date, count)
    VALUES (p_user_id, p_date, 0)
  ON CONFLICT (user_id, date) DO NOTHING;

  SELECT count INTO v_current
    FROM ai_usage_daily
   WHERE user_id = p_user_id AND date = p_date
     FOR UPDATE;

  IF v_current >= p_limit THEN
    RETURN -1;
  END IF;

  UPDATE ai_usage_daily
     SET count = count + 1
   WHERE user_id = p_user_id AND date = p_date
  RETURNING count INTO v_new_count;

  RETURN v_new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_ai_usage_daily_capped(uuid, date, integer)
  TO service_role;

COMMENT ON TABLE ai_usage_daily IS
  'Per-day AI call counts per user. Used to enforce a daily burst cap for '
  'free users (3 calls/day) independently of the monthly cap (30/month). '
  'Builder plan rows are written for analytics but no cap is enforced.';

