-- Avoided areas the founder marked as faced, with timestamps.
-- Read by lib/weeklyPulseData.ts for the Avoidance Resistance grade.
ALTER TABLE founder_memory
  ADD COLUMN IF NOT EXISTS avoidance_resolved jsonb NOT NULL DEFAULT '[]'::jsonb;
