-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: pattern_detection_columns
-- Adds the columns required by lib/patternDetection.ts and the task-complete
-- route. Without these columns the pattern detection system writes silently to
-- nowhere and never fires in production.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS active_pattern_signal    text,
  ADD COLUMN IF NOT EXISTS active_pattern_message   text,
  ADD COLUMN IF NOT EXISTS active_pattern_subject   text,
  ADD COLUMN IF NOT EXISTS last_pattern_shown_at    timestamptz,
  ADD COLUMN IF NOT EXISTS momentum_last_week       integer;

-- Index for the cron route — it queries last_pattern_shown_at to avoid
-- repeating patterns within the cooldown window.
CREATE INDEX IF NOT EXISTS idx_founder_context_last_pattern
  ON founder_context (user_id, last_pattern_shown_at);

COMMENT ON COLUMN founder_context.active_pattern_signal    IS 'Most recent pattern signal: avoidance | override_cluster | momentum_decay | topic_repeat';
COMMENT ON COLUMN founder_context.active_pattern_message   IS 'Human-readable pattern message surfaced to the founder';
COMMENT ON COLUMN founder_context.active_pattern_subject   IS 'Category or topic that triggered the pattern';
COMMENT ON COLUMN founder_context.last_pattern_shown_at    IS 'Timestamp of last pattern surface — used to enforce cooldown (24h high / 48h medium)';
COMMENT ON COLUMN founder_context.momentum_last_week       IS 'Momentum score from 7 days ago — used to compute week-over-week decay signal';
