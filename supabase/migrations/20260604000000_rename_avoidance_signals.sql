DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'founder_context'
      AND column_name = 'avoidance_signals'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'founder_context'
      AND column_name = 'avoidance_zones'
  ) THEN
    ALTER TABLE founder_context RENAME COLUMN avoidance_signals TO avoidance_zones;
  END IF;
END $$;

ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS active_pattern_signal text,
  ADD COLUMN IF NOT EXISTS active_pattern_message text,
  ADD COLUMN IF NOT EXISTS active_pattern_subject text,
  ADD COLUMN IF NOT EXISTS last_pattern_shown_at timestamptz,
  ADD COLUMN IF NOT EXISTS tasks_completed_total int4 NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_task_date date,
  ADD COLUMN IF NOT EXISTS learned_patterns jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS momentum_last_week int2;

CREATE INDEX IF NOT EXISTS founder_context_pattern_idx
  ON founder_context (user_id, last_pattern_shown_at DESC NULLS LAST)
  WHERE active_pattern_signal IS NOT NULL;

CREATE TABLE IF NOT EXISTS score_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score        int2        NOT NULL CHECK (score >= 0 AND score <= 100),
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE score_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "score_history_self_only" ON score_history;
CREATE POLICY "score_history_self_only" ON score_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS score_history_user_day_uniq
  ON score_history (user_id, (recorded_at::date));
CREATE INDEX IF NOT EXISTS score_history_user_date_idx
  ON score_history (user_id, recorded_at DESC);
