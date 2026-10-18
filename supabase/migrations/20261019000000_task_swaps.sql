-- Importance-preserving task swaps: what was rejected, why, what replaced it,
-- and whether the replacement got done.

CREATE TABLE IF NOT EXISTS today_swaps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id       uuid,
  rejected_task    text NOT NULL,
  rejected_kind    text,
  reason           text,
  mode             text NOT NULL CHECK (mode IN ('shrink', 'alternative')),
  replacement_task text,
  replacement_kind text,
  guarded          boolean NOT NULL DEFAULT false,
  outcome          text,
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE today_swaps ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS today_swaps_user_idx ON today_swaps (user_id, created_at DESC);

-- "Don't feel like it" is now a first-class reason on a rejected task.
ALTER TABLE today_feedback DROP CONSTRAINT IF EXISTS today_feedback_reason_check;
ALTER TABLE today_feedback ADD CONSTRAINT today_feedback_reason_check
  CHECK (reason IN ('no_users', 'no_access', 'already_done', 'too_big', 'not_relevant', 'no_time', 'no_motivation'));
