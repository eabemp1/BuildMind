-- 20260519000000_funnel_rpc.sql
--
-- Adds the increment_funnel_step RPC called by /api/analytics/funnel-event/route.ts
-- The funnel_events table was created in 20260517000004 but the RPC was never added,
-- causing all funnel analytics to silently record zero data.

CREATE OR REPLACE FUNCTION increment_funnel_step(
  p_step     text,
  p_user_id  uuid    DEFAULT NULL,
  p_meta     jsonb   DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO funnel_events (user_id, step, meta, created_at)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    p_step,
    p_meta,
    now()
  );
END;
$$;

-- Grant execute to authenticated and anon (rate limiting is handled at the API layer)
GRANT EXECUTE ON FUNCTION increment_funnel_step(text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_funnel_step(text, uuid, jsonb) TO anon;

COMMENT ON FUNCTION increment_funnel_step IS
  'Inserts a funnel event row. Called by /api/analytics/funnel-event. Added by migration 20260519000000 — the table existed since 20260517000004 but the RPC was missing.';
