-- Server source of truth for meaningful per-user behavior state that used to
-- live only in localStorage: coach memory, AI personality, prompt/dismissal
-- flags, and daily loop cache fields.

CREATE TABLE IF NOT EXISTS user_behavior_state (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key        text        NOT NULL,
  value      jsonb       NOT NULL DEFAULT 'null'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE user_behavior_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_behavior_state_self_only ON user_behavior_state;
CREATE POLICY user_behavior_state_self_only
  ON user_behavior_state
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_behavior_state_user_updated
  ON user_behavior_state (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION set_user_behavior_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_behavior_state_updated_at ON user_behavior_state;
CREATE TRIGGER user_behavior_state_updated_at
  BEFORE UPDATE ON user_behavior_state
  FOR EACH ROW EXECUTE FUNCTION set_user_behavior_state_updated_at();

COMMENT ON TABLE user_behavior_state IS
  'Server-owned user behavior state. localStorage may cache these values, but this table is authoritative.';
