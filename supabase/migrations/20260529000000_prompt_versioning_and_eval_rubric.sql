-- Adds prompt versioning and richer AI evaluation telemetry.

CREATE TABLE IF NOT EXISTS prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id text NOT NULL CHECK (prompt_id IN (
    'reflexion_generator',
    'reflexion_critic',
    'reflexion_refiner',
    'reflexion_rationale',
    'coach_system',
    'morning_briefing',
    'evening_check',
    'founder_insight',
    'archetype_classifier',
    'break_startup_market',
    'break_startup_competitor',
    'break_startup_risk'
  )),
  version text NOT NULL,
  text text,
  author text NOT NULL DEFAULT 'system',
  notes text,
  is_active boolean NOT NULL DEFAULT false,
  metrics jsonb DEFAULT NULL,
  challenger_version text DEFAULT NULL,
  challenger_text text DEFAULT NULL,
  challenger_traffic_pct integer DEFAULT 0 CHECK (challenger_traffic_pct BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_versions_active_one_per_prompt
  ON prompt_versions (prompt_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt_created
  ON prompt_versions (prompt_id, created_at DESC);

ALTER TABLE reflexion_quality_log
  ADD COLUMN IF NOT EXISTS eval_rubric jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS overall_score numeric(3,1) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pre_screen_failed text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prompt_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prompt_version text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prompt_variant text DEFAULT 'active'
    CHECK (prompt_variant IN ('active', 'challenger'));

CREATE INDEX IF NOT EXISTS idx_rql_prompt_version
  ON reflexion_quality_log (prompt_id, prompt_version)
  WHERE prompt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rql_created_desc
  ON reflexion_quality_log (created_at DESC);

ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins only via service role" ON prompt_versions;
CREATE POLICY "Admins only via service role"
  ON prompt_versions
  FOR ALL
  USING (false)
  WITH CHECK (false);

INSERT INTO prompt_versions (prompt_id, version, author, notes, is_active)
VALUES
  ('reflexion_generator', 'v1', 'system', 'Baseline from lib/reflexion.ts runReflexionLoop().', false),
  ('reflexion_critic', 'v1', 'system', 'Baseline from lib/reflexion.ts critic prompt.', false),
  ('reflexion_refiner', 'v1', 'system', 'Baseline from lib/reflexion.ts refiner prompt.', false),
  ('reflexion_rationale', 'v1', 'system', 'Baseline from lib/reflexion.ts rationale prompt.', false),
  ('coach_system', 'v1', 'system', 'Baseline from app/api/ai/coach/route.ts system prompt.', false),
  ('morning_briefing', 'v1', 'system', 'Baseline from morning briefing prompt.', false),
  ('evening_check', 'v1', 'system', 'Baseline from evening check prompt.', false),
  ('founder_insight', 'v1', 'system', 'Baseline from founder insight prompt.', false),
  ('archetype_classifier', 'v1', 'system', 'Baseline from founder archetype classifier.', false),
  ('break_startup_market', 'v1', 'system', 'Baseline from market research agent prompt.', false),
  ('break_startup_competitor', 'v1', 'system', 'Baseline from competitor agent prompt.', false),
  ('break_startup_risk', 'v1', 'system', 'Baseline from risk agent prompt.', false)
ON CONFLICT DO NOTHING;
