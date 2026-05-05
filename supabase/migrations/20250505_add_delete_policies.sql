-- Migration: Add missing DELETE RLS policies
-- Fixes: projects cannot be deleted due to missing DELETE policy

-- Add DELETE policy for projects
CREATE POLICY projects_delete_own ON projects
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add DELETE policy for milestones
CREATE POLICY milestones_delete_own ON milestones
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add DELETE policy for tasks
CREATE POLICY tasks_delete_own ON tasks
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add DELETE policy for founder_context (if needed for resets)
CREATE POLICY founder_context_delete_own ON founder_context
  FOR DELETE
  USING (auth.uid() = user_id);
