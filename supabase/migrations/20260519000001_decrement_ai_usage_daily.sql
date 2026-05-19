-- Atomic rollback helper for daily AI usage.
--
-- enforceAndTrackAIUsage increments the daily counter before checking the
-- monthly cap. If the monthly cap blocks the call, this function rolls the
-- daily increment back without racing concurrent successful requests.

CREATE OR REPLACE FUNCTION decrement_ai_usage_daily(
  p_user_id uuid,
  p_date    date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count integer := 0;
BEGIN
  UPDATE ai_usage_daily
     SET count = GREATEST(count - 1, 0)
   WHERE user_id = p_user_id
     AND date = p_date
  RETURNING count INTO v_new_count;

  RETURN COALESCE(v_new_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION decrement_ai_usage_daily(uuid, date)
  TO service_role;
