-- Build 4: Today follow-up loops, "doesn't fit me" feedback, quality telemetry.
-- All three are service-role only (RLS on, no policies); routes check the signed-in user.

-- ── Follow-up loops: the founder says "check back in N days", Today brings it back ──
CREATE TABLE IF NOT EXISTS today_loops (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id    uuid,
  task_text     text NOT NULL,
  measure       text NOT NULL,                 -- what to record when it is due
  due_at        timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'recorded', 'dismissed')),
  snooze_count  int  NOT NULL DEFAULT 0,
  notified_at   timestamptz,                   -- set once the reminder notification is created
  evidence      text,
  result        text CHECK (result IN ('worked', 'mixed', 'failed')),
  metric_value  numeric,
  metric_label  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
ALTER TABLE today_loops ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS today_loops_user_due_idx ON today_loops (user_id, status, due_at);
CREATE INDEX IF NOT EXISTS today_loops_due_idx ON today_loops (status, due_at) WHERE status = 'open';

-- ── "This task doesn't fit me": reason becomes a fact the generator must respect ──
CREATE TABLE IF NOT EXISTS today_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  uuid,
  task_text   text NOT NULL,
  reason      text NOT NULL CHECK (reason IN ('no_users', 'no_access', 'already_done', 'too_big', 'not_relevant', 'no_time')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE today_feedback ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS today_feedback_user_idx ON today_feedback (user_id, created_at DESC);

-- ── Quality telemetry: what the deterministic guards rejected, and why ──
CREATE TABLE IF NOT EXISTS today_quality_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  project_id    uuid,
  kind          text NOT NULL CHECK (kind IN ('rejected', 'fallback', 'outcome_adjusted', 'feedback', 'loop_recorded')),
  rules         text[] NOT NULL DEFAULT '{}',
  task          text,
  detail        text,
  mission_kind  text,
  stage         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE today_quality_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS today_quality_events_created_idx ON today_quality_events (created_at DESC);
CREATE INDEX IF NOT EXISTS today_quality_events_kind_idx ON today_quality_events (kind, created_at DESC);
