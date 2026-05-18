-- Migration: Add INSERT policy to ai_usage table
-- Fixes: AI usage tracking not working (ai_usage_30d_count = 0 in stats)

DROP POLICY IF EXISTS ai_usage_insert_own ON ai_usage;

CREATE POLICY ai_usage_insert_own ON ai_usage
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Also add UPDATE policy in case we need to update rows
DROP POLICY IF EXISTS ai_usage_update_own ON ai_usage;
CREATE POLICY ai_usage_update_own ON ai_usage
  FOR UPDATE
  USING (auth.uid() = user_id);

