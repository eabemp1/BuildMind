-- Fix: progressive sidebar unlock counter was localStorage-only.
-- Adding tasks_completed_total to founder_context makes it device-independent.
-- Existing rows get 0 as default. The /api/founder-context/task-complete route
-- increments this on every check-in submission.

ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS tasks_completed_total int4 NOT NULL DEFAULT 0;

COMMENT ON COLUMN founder_context.tasks_completed_total IS
  'Lifetime cumulative task completions — drives progressive sidebar unlock. '
  'Client reads this on load and falls back to localStorage for backwards compat.';
