-- Migration: 20260426000000_founder_context_and_momentum.sql
-- Adds the Founder Context Object (agentic memory), momentum_score column,
-- and scheduled job audit log.

-- ── 1. founder_context table — the brain behind everything ──────────────────
-- This is the Founder Context Object described in Playbook Section 3.1.
-- Updated after every meaningful interaction. Feeds into every Reflexion loop call.

CREATE TABLE IF NOT EXISTS founder_context (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core identity
  startup_summary             text,
  current_stage               text        NOT NULL DEFAULT 'Idea',

  -- Momentum
  momentum_score              int2        NOT NULL DEFAULT 50
                                          CHECK (momentum_score BETWEEN 0 AND 100),
  momentum_updated_at         timestamptz NOT NULL DEFAULT now(),
  last_active                 date        NOT NULL DEFAULT CURRENT_DATE,
  days_inactive               int2        NOT NULL DEFAULT 0,

  -- Task behaviour
  tasks_accepted_this_week    int2        NOT NULL DEFAULT 0,
  tasks_overridden_this_week  int2        NOT NULL DEFAULT 0,
  override_reasons            text[]      NOT NULL DEFAULT '{}',
  topics_mentioned_repeatedly text[]      NOT NULL DEFAULT '{}',

  -- Cognitive state
  cognitive_load              text        NOT NULL DEFAULT 'fresh'
                                          CHECK (cognitive_load IN ('fresh','drained','autopilot')),
  cognitive_pattern           text,       -- e.g. "drained Mondays, fresh Thursdays"

  -- Agentic signals
  avoidance_signals           text[]      NOT NULL DEFAULT '{}',
  breakthrough_moments        text[]      NOT NULL DEFAULT '{}',
  competitor_context          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  pattern_flags               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- {avoidance: bool, override_clustering: bool, momentum_decay: bool, topic_repetition: bool}

  -- Scheduling
  timezone_offset             int2        NOT NULL DEFAULT 0, -- UTC offset in hours
  morning_briefing_hour       int2        NOT NULL DEFAULT 7,
  evening_check_hour          int2        NOT NULL DEFAULT 18,

  -- Meta
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id)
);

ALTER TABLE founder_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "founder_context_self_only"
  ON founder_context FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS founder_context_user_id_idx ON founder_context (user_id);
CREATE INDEX IF NOT EXISTS founder_context_last_active_idx ON founder_context (last_active);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_founder_context_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER founder_context_updated_at
  BEFORE UPDATE ON founder_context
  FOR EACH ROW EXECUTE FUNCTION update_founder_context_timestamp();

COMMENT ON TABLE founder_context IS
  'Founder Context Object — the structured agentic profile described in BuildMind Playbook Section 3.1.
   Updated after every interaction. Passed into every Reflexion loop call.
   This is the moat: accumulated context that makes AI responses feel like they actually know the founder.';


-- ── 2. morning_briefings table — stores generated briefings ─────────────────
CREATE TABLE IF NOT EXISTS morning_briefings (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  win           text        NOT NULL,    -- Win from yesterday
  risk          text        NOT NULL,    -- Risk today
  action        text        NOT NULL,    -- One action right now
  raw_context   jsonb,                   -- Snapshot of founder_context used to generate
  delivered_at  timestamptz,
  opened_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE morning_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "briefings_self_only" ON morning_briefings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS morning_briefings_user_created
  ON morning_briefings (user_id, created_at DESC);


-- ── 3. evening_checks table — stores evening nudge results ──────────────────
CREATE TABLE IF NOT EXISTS evening_checks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_completed  boolean   NOT NULL DEFAULT false,
  nudge_sent    boolean     NOT NULL DEFAULT false,
  nudge_text    text,
  momentum_before int2,
  momentum_after  int2,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE evening_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evening_checks_self_only" ON evening_checks FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── 4. scheduled_job_log — audit trail for all 3 scheduled jobs ─────────────
CREATE TABLE IF NOT EXISTS scheduled_job_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name    text        NOT NULL,  -- 'morning_briefing' | 'evening_check' | 'weekly_mirror'
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status      text        NOT NULL,  -- 'success' | 'skipped' | 'error'
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Only service role can write to this
ALTER TABLE scheduled_job_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scheduled_job_log_service_only"
  ON scheduled_job_log FOR ALL USING (false);


-- ── 5. Add momentum_score to projects table (convenience column) ─────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'momentum_score'
  ) THEN
    ALTER TABLE projects ADD COLUMN momentum_score int2 NOT NULL DEFAULT 50
      CHECK (momentum_score BETWEEN 0 AND 100);
  END IF;
END $$;

-- ── 6. Add cognitive_load to users table (last known state) ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'cognitive_load'
  ) THEN
    ALTER TABLE users ADD COLUMN cognitive_load text DEFAULT 'fresh';
  END IF;
END $$;
