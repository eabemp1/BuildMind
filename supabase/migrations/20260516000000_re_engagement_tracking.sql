-- Migration: 20260516000000_re_engagement_tracking
--
-- Adds last_re_engagement_email_at to founder_context so the re-engage cron
-- (/api/cron/re-engage) can avoid double-sending emails to the same user
-- within a re-engagement window.
--
-- Also indexes days_inactive for the cron's range query — without this the
-- re-engage query does a full table scan which gets expensive at scale.

-- 1. Column (idempotent)
ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS last_re_engagement_email_at timestamptz;

COMMENT ON COLUMN founder_context.last_re_engagement_email_at IS
  'Timestamp of the last re-engagement email sent to this founder. '
  'Used by /api/cron/re-engage to prevent double-sending within a 5-day window.';

-- 2. Index for the cron's days_inactive range query
CREATE INDEX IF NOT EXISTS idx_founder_context_days_inactive
  ON founder_context (days_inactive)
  WHERE days_inactive >= 6;

-- 3. Index for lookups that filter by last_re_engagement_email_at
CREATE INDEX IF NOT EXISTS idx_founder_context_re_engagement
  ON founder_context (last_re_engagement_email_at)
  WHERE last_re_engagement_email_at IS NOT NULL;
