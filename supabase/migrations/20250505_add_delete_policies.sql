-- Migration: Add missing DELETE RLS policies
-- Fixes: projects cannot be deleted due to missing DELETE policy

-- Add DELETE policy for projects
DROP POLICY IF EXISTS projects_delete_own ON projects;
CREATE POLICY projects_delete_own ON projects
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add DELETE policy for milestones
DROP POLICY IF EXISTS milestones_delete_own ON milestones;
CREATE POLICY milestones_delete_own ON milestones
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add DELETE policy for tasks
DROP POLICY IF EXISTS tasks_delete_own ON tasks;
CREATE POLICY tasks_delete_own ON tasks
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add DELETE policy for founder_context (if needed for resets)
DROP POLICY IF EXISTS founder_context_delete_own ON founder_context;
CREATE POLICY founder_context_delete_own ON founder_context
  FOR DELETE
  USING (auth.uid() = user_id);

