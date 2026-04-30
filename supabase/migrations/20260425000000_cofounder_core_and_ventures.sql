-- Migration: 20260425000000_cofounder_core_and_ventures.sql
-- Adds CoFounder Core fields to founder_memory and creates ventures_blueprints table.

-- ── 1. Extend founder_memory with CoFounder Core fields ─────────────────────

ALTER TABLE founder_memory
  ADD COLUMN IF NOT EXISTS validation_receipts  jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS competitor_history   jsonb DEFAULT '[]'::jsonb NOT NULL;

COMMENT ON COLUMN founder_memory.validation_receipts IS
  'Array of ValidationReceipt objects — real human responses that confirm the problem is real. Surfaced during competitor spirals.';

COMMENT ON COLUMN founder_memory.competitor_history IS
  'Array of CompetitorHistoryEntry objects — tracks which competitors the founder has looked up and how often, used to detect avoidance patterns.';

-- ── 2. Create ventures_blueprints table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS ventures_blueprints (
  id                  text        PRIMARY KEY,
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  input_type          text        NOT NULL DEFAULT 'text',
  intent_summary      text        NOT NULL DEFAULT '',
  problem_statement   text        NOT NULL DEFAULT '',
  blueprint_json      jsonb,        -- full blueprint stored for history / export
  startup_score       int2,         -- feasibility score 0-100
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- RLS: users can only see their own blueprints
ALTER TABLE ventures_blueprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ventures_blueprints_self_only"
  ON ventures_blueprints
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ventures_blueprints_user_created
  ON ventures_blueprints (user_id, created_at DESC);

COMMENT ON TABLE ventures_blueprints IS
  'Stores generated startup blueprints from BuildMind Ventures. One row per generation event.';

-- ── 3. Create cofounder_reframe_log table (rate limiting + analytics) ────────

CREATE TABLE IF NOT EXISTS cofounder_reframe_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competitor_name text        NOT NULL,
  competitor_url  text,
  week_key        text        NOT NULL,  -- "YYYY-Www" ISO week format
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cofounder_reframe_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reframe_log_self_only"
  ON cofounder_reframe_log
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS reframe_log_user_week
  ON cofounder_reframe_log (user_id, week_key);

COMMENT ON TABLE cofounder_reframe_log IS
  'Tracks Competitor Reframe usage per user per week for plan gating (3/week free, unlimited builder).';

-- ── 4. Trigger: auto-update ventures_blueprints.updated_at ──────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'ventures_blueprints_updated_at'
  ) THEN
    CREATE TRIGGER ventures_blueprints_updated_at
      BEFORE UPDATE ON ventures_blueprints
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
