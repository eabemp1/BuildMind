-- Migration: Rich reflection fields for aggressive personalisation
-- Splits the single `note` blob into structured data points the AI can
-- learn from independently. All columns nullable for backward compat.

ALTER TABLE reflections
  ADD COLUMN IF NOT EXISTS what_tried    TEXT,   -- specific action the founder attempted
  ADD COLUMN IF NOT EXISTS what_happened TEXT,   -- concrete result with numbers
  ADD COLUMN IF NOT EXISTS what_learned  TEXT,   -- insight extracted from the session
  ADD COLUMN IF NOT EXISTS blocker       TEXT;   -- exact blocker when outcome = 'blocked'

-- Index blocker for gap detection queries
CREATE INDEX IF NOT EXISTS idx_reflections_blocker
  ON reflections (user_id, created_at DESC)
  WHERE blocker IS NOT NULL;

-- Index what_happened for pattern learning queries
CREATE INDEX IF NOT EXISTS idx_reflections_what_happened
  ON reflections (user_id, created_at DESC)
  WHERE what_happened IS NOT NULL;

COMMENT ON COLUMN reflections.what_tried    IS 'Specific action the founder attempted — separated from outcome for pattern learning';
COMMENT ON COLUMN reflections.what_happened IS 'Concrete result, ideally with numbers — feeds personalisation engine';
COMMENT ON COLUMN reflections.what_learned  IS 'Insight the founder extracted — used for founder memory synthesis';
COMMENT ON COLUMN reflections.blocker       IS 'Exact blocker when blocked — used to detect recurring blockers';
