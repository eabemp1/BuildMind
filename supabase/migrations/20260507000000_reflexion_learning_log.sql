-- Migration: 20260507000000_reflexion_learning_log.sql
--
-- Adds the reflexion_learning_log table so the AI can learn from founder
-- behaviour over time — which action types get completed, which get overridden,
-- which pivot angles resonate, and what avoidance patterns emerge.
--
-- This is the feedback memory layer described in the system spec.
-- The learning loop works as follows:
--   1. break-my-startup/route.ts writes a row when it shows an action
--   2. Founder completes or overrides the action → outcome written via
--      /api/ai/reflexion-outcome (new route, see lib/learning.ts)
--   3. lib/learning.ts reads the last 20 rows for this user and derives
--      behavioral patterns (preferred action types, avoided angles, etc.)
--   4. runFullReflexionPipeline() receives those patterns and injects them
--      into the Generator and Refiner prompts
--
-- No external services. No new env vars. Pure Supabase.

-- ─── Main learning log table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reflexion_learning_log (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id          text,                                    -- nullable: idea-only runs have no project
  session_id          text          NOT NULL,                  -- client-generated UUID per analysis run
  stage               text          NOT NULL DEFAULT 'Idea',   -- founder stage at time of analysis

  -- What the AI showed the founder
  action_shown        text          NOT NULL,                  -- the final Stage 7 action text
  action_type         text,                                    -- categorised: 'user_interview' | 'content' | 'outreach' | 'build' | 'research' | 'pivot' | 'pricing' | 'other'
  action_platform     text,                                    -- extracted platform: 'linkedin' | 'whatsapp' | 'twitter' | 'email' | 'reddit' | 'other'
  critic_persona      text,                                    -- which rotating persona was active: 'yc_partner' | 'growth_hacker' | 'accountant' | 'customer_advocate'
  viability_score     integer,                                 -- score at time of this action
  confidence          numeric(4,3),                            -- 0–1 from verifier

  -- Pivot shown (nullable — only when pivot was the primary recommendation)
  pivot_angle         text,                                    -- e.g. 'niche_down' | 'b2b_pivot' | 'services_first'
  pivot_title         text,

  -- What the founder did with it
  outcome             text          CHECK (outcome IN (
                        'completed',    -- founder marked as done
                        'overridden',   -- founder rejected and picked a different task
                        'ignored',      -- founder saw it, did nothing (inferred after 24h)
                        'partial',      -- founder started but did not finish
                        'pending'       -- not yet resolved
                      )) DEFAULT 'pending',
  outcome_note        text,           -- optional: what the founder typed when overriding
  outcome_recorded_at timestamptz,   -- when the outcome was set (null while pending)

  -- Time
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Primary read pattern: fetch last N rows for a user to derive patterns
CREATE INDEX IF NOT EXISTS rll_user_created
  ON reflexion_learning_log (user_id, created_at DESC);

-- Secondary: filter by project for project-specific learning
CREATE INDEX IF NOT EXISTS rll_user_project
  ON reflexion_learning_log (user_id, project_id, created_at DESC);

-- Outcome queries: find overridden/ignored patterns
CREATE INDEX IF NOT EXISTS rll_user_outcome
  ON reflexion_learning_log (user_id, outcome, action_type);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE reflexion_learning_log ENABLE ROW LEVEL SECURITY;

-- Users can only read and write their own rows
CREATE POLICY "rll_select_own"
  ON reflexion_learning_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "rll_insert_own"
  ON reflexion_learning_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "rll_update_own"
  ON reflexion_learning_log FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role bypasses RLS (for API routes using createAdminClient)
-- This is handled automatically by the service role key — no extra policy needed.

-- ─── Auto-update updated_at ───────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'rll_updated_at'
  ) THEN
    CREATE TRIGGER rll_updated_at
      BEFORE UPDATE ON reflexion_learning_log
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

-- ─── Add learned_patterns column to founder_context ──────────────────────────
-- Stores the derived pattern summary so we don't re-derive it on every call.
-- Updated by lib/learning.ts after each outcome is recorded.

ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS learned_patterns jsonb DEFAULT '{}'::jsonb;

ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS last_break_analysis jsonb DEFAULT NULL;

-- ─── Comments ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE reflexion_learning_log IS
  'Records every action shown by the Reflexion pipeline and its outcome. '
  'Used by lib/learning.ts to derive behavioral patterns that improve future recommendations.';

COMMENT ON COLUMN reflexion_learning_log.action_type IS
  'Categorised action type. Derived server-side from action text. '
  'Used to detect which action types this founder completes vs avoids.';

COMMENT ON COLUMN reflexion_learning_log.outcome IS
  'What the founder did with the recommended action. '
  'pending = not yet resolved. ignored = inferred after 24h with no update.';

COMMENT ON COLUMN founder_context.learned_patterns IS
  'Derived behavioral pattern summary. Updated by lib/learning.ts. '
  'Shape: { preferred_action_types, avoided_action_types, avoided_platforms, '
  'override_reasons, pivot_angles_tried, completion_rate, total_logged }';
