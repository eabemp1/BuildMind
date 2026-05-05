-- Supabase / PostgreSQL: list all non-system tables and their columns
-- Run this in the Supabase SQL editor (or psql) to get schema overview

SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema NOT IN ('information_schema','pg_catalog')
ORDER BY table_schema, table_name, ordinal_position;

-- Alternative: only public schema
-- SELECT table_name, column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
-- ORDER BY table_name, ordinal_position;
