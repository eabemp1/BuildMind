-- project_analyses — Break My Startup result cache (Audit v8 ENG #9)
--
-- PROBLEM: Break My Startup runs 5 parallel LLM calls every time.
-- Most inputs don't change between runs. Cache by (project_id, inputs_hash).
-- SECONDARY VALUE: queryable by benchmark pipeline for aggregate signals.

CREATE TABLE IF NOT EXISTS project_analyses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Hash of description+stage+problem+target_users — changes when project changes
  inputs_hash      text NOT NULL,
  -- Full Break My Startup result JSON
  result           jsonb NOT NULL,
  -- Top-level signals as dedicated columns for fast benchmark aggregation
  survival_score   int  CHECK (survival_score BETWEEN 0 AND 100),
  confidence_score real CHECK (confidence_score BETWEEN 0 AND 1),
  verdict          text CHECK (verdict IN ('strong', 'viable', 'risky', 'critical')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One analysis row per project (latest wins on upsert)
CREATE UNIQUE INDEX IF NOT EXISTS project_analyses_project_id_idx
  ON project_analyses (project_id);

CREATE INDEX IF NOT EXISTS project_analyses_verdict_score_idx
  ON project_analyses (verdict, survival_score) WHERE verdict IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_analyses_updated_at_idx
  ON project_analyses (updated_at DESC);

ALTER TABLE project_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_analyses_select_own" ON project_analyses;

CREATE POLICY "project_analyses_select_own" ON project_analyses FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "project_analyses_insert_own" ON project_analyses;
CREATE POLICY "project_analyses_insert_own" ON project_analyses FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "project_analyses_update_own" ON project_analyses;
CREATE POLICY "project_analyses_update_own" ON project_analyses FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "project_analyses_delete_own" ON project_analyses;
CREATE POLICY "project_analyses_delete_own" ON project_analyses FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_project_analyses_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_project_analyses_updated_at ON project_analyses;

CREATE TRIGGER trg_project_analyses_updated_at
  BEFORE UPDATE ON project_analyses
  FOR EACH ROW EXECUTE FUNCTION update_project_analyses_updated_at();


