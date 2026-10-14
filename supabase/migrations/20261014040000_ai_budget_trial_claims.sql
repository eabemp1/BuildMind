-- Build 3: global AI budget guard + one-trial-per-person defence.
-- Both tables are service-role only (RLS on, no policies).

-- ── Global AI call counter (per UTC day, per bucket) ────────────────────────
CREATE TABLE IF NOT EXISTS ai_global_daily (
  day     date   NOT NULL,
  bucket  text   NOT NULL,           -- 'free' | 'trial' | 'paid' | 'public'
  calls   bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (day, bucket)
);
ALTER TABLE ai_global_daily ENABLE ROW LEVEL SECURITY;

-- Adds p_inc to a bucket (0 = read only) and returns today's totals.
CREATE OR REPLACE FUNCTION bm_ai_global_bump(p_day date, p_bucket text, p_inc integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket bigint;
  v_total  bigint;
BEGIN
  IF p_inc > 0 THEN
    INSERT INTO ai_global_daily (day, bucket, calls) VALUES (p_day, p_bucket, p_inc)
    ON CONFLICT (day, bucket) DO UPDATE SET calls = ai_global_daily.calls + p_inc
    RETURNING calls INTO v_bucket;
  ELSE
    SELECT calls INTO v_bucket FROM ai_global_daily WHERE day = p_day AND bucket = p_bucket;
  END IF;
  SELECT COALESCE(SUM(calls), 0) INTO v_total FROM ai_global_daily WHERE day = p_day;
  RETURN jsonb_build_object('bucket', COALESCE(v_bucket, 0), 'total', v_total);
END;
$$;
REVOKE ALL ON FUNCTION bm_ai_global_bump(date, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bm_ai_global_bump(date, text, integer) TO service_role;

-- ── One free trial per real person ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trial_claims (
  normalized_email text PRIMARY KEY,
  user_id          uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE trial_claims ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS trial_claims_user_idx ON trial_claims (user_id);
