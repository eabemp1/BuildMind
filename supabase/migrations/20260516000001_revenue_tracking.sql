-- Migration: Revenue tracking fields
-- Adds current_mrr to projects and revenue_delta to reflections
-- These feed the reflexion loop so it reasons against real financial numbers
-- rather than giving generic advice.

-- Add current MRR to projects (manually entered by founder, updated any time)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS current_mrr integer DEFAULT 0 CHECK (current_mrr >= 0),
  ADD COLUMN IF NOT EXISTS mrr_updated_at timestamp DEFAULT now();

COMMENT ON COLUMN projects.current_mrr IS
  'Current monthly recurring revenue in smallest currency unit (pesewas/cents). '
  'Manually entered by founder. Fed into reflexion loop for revenue-aware task generation.';

-- Add revenue delta to reflections (optional: "did this move the needle?")
ALTER TABLE reflections
  ADD COLUMN IF NOT EXISTS revenue_delta integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS revenue_delta_note text DEFAULT NULL;

COMMENT ON COLUMN reflections.revenue_delta IS
  'Optional revenue change attributed to this task completion, in smallest currency unit. '
  'Null = founder did not attribute revenue. 0 = explicitly no impact. Positive = gain.';

COMMENT ON COLUMN reflections.revenue_delta_note IS
  'Free-text attribution note, e.g. "Closed 2 new customers at GHS 200 each".';
