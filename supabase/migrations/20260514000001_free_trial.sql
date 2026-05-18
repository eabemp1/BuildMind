-- Migration: 7-day free trial system
-- Adds trial_started_at and trial_ends_at to profiles/auth metadata.
-- Used by plan.ts to grant Builder access during the trial window,
-- then enforce a hard paywall on day 8.
--
-- No new table needed — we use user_metadata (set via admin client on signup)
-- and track trial expiry in founder_context for server-authoritative checks.

ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS trial_started_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trial_ends_at     TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trial_expired     BOOLEAN     NOT NULL DEFAULT FALSE;

-- Index for the billing-status cron that checks expired trials
CREATE INDEX IF NOT EXISTS idx_founder_context_trial_ends_at
  ON founder_context (trial_ends_at)
  WHERE trial_ends_at IS NOT NULL AND trial_expired = FALSE;

-- Helper: mark trial as expired (called by billing/status route on day 8+)
CREATE OR REPLACE FUNCTION expire_free_trial(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE founder_context
  SET trial_expired = TRUE
  WHERE user_id = p_user_id
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < NOW()
    AND trial_expired = FALSE;
END;
$$;
