-- Consolidate name/title dual-column on projects (Audit v8 ENG #5)
--
-- PROBLEM: projects table has both `name` and `title` columns. Queries use
-- `name ?? title` or `title ?? name` inconsistently. This causes:
--   (a) Ambiguous "which is canonical?" questions in every query
--   (b) New rows can end up with data in either column depending on the code path
--   (c) The UI shows stale/empty names when the wrong column is used
--
-- SOLUTION: Make `name` canonical. Backfill name from title where name is null.
-- Add a NOT NULL constraint. Keep `title` temporarily as a generated column
-- (alias) so existing queries don't break, then drop it in a follow-up migration
-- once all query references are updated.

-- Step 1: Backfill — set name = title wherever name is null or empty
UPDATE projects
SET name = title
WHERE (name IS NULL OR name = '') AND title IS NOT NULL AND title != '';

-- Step 2: For any remaining rows with neither, set a placeholder
UPDATE projects
SET name = 'Untitled Project'
WHERE name IS NULL OR name = '';

-- Step 3: Add NOT NULL constraint now that all rows have a name
ALTER TABLE projects ALTER COLUMN name SET NOT NULL;

-- Step 4: Keep title as a nullable alias for now (backward compat during code cleanup)
-- Once all code references to `title` are removed, run:
--   ALTER TABLE projects DROP COLUMN title;
-- (do NOT run this now — staged removal is safer)

-- Step 5: Add a check to prevent new rows from using title without name
-- (application-level enforcement via the NOT NULL on name is sufficient)

COMMENT ON COLUMN projects.name IS
  'Canonical project name. Always populated. title column is deprecated — use name.';

COMMENT ON COLUMN projects.title IS
  'DEPRECATED. Use name. Will be dropped after all code references are removed.';
