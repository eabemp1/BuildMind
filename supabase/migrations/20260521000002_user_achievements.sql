-- Migration: user_achievements table for cross-device achievement persistence
-- Previously achievements were localStorage-only; this adds server truth

CREATE TABLE IF NOT EXISTS user_achievements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL,
  unlocked_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);

-- RLS: users can only see/write their own achievements
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_achievements_select" ON user_achievements
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_achievements_insert" ON user_achievements
  FOR INSERT WITH CHECK (auth.uid() = user_id);
