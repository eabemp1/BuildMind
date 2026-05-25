ALTER TABLE founder_memory
  ADD COLUMN IF NOT EXISTS last_week_summary text DEFAULT NULL;
ALTER TABLE founder_memory
  ADD COLUMN IF NOT EXISTS initial_analysis text DEFAULT NULL;
ALTER TABLE founder_memory
  ADD COLUMN IF NOT EXISTS pending_milestone_break text DEFAULT NULL;