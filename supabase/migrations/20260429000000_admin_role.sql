-- Migration: 20260429000000_admin_role.sql
-- Replaces NEXT_PUBLIC_ADMIN_USER_ID env-var pattern with a server-side
-- is_admin column on profiles. Grants cannot be spoofed from the client.

-- 1. Add is_admin column (default false — no one is an admin until explicitly set)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 2. RLS: only the user themselves can read their own row (already enforced).
--    The is_admin column is only evaluated server-side via the service-role key.

-- 3. One-time bootstrap: if NEXT_PUBLIC_ADMIN_USER_ID was set, promote that user.
--    Run this manually after applying the migration:
--
--    UPDATE profiles SET is_admin = true WHERE id = '<your-admin-uuid>';
--
--    After confirming the owner panel works, remove NEXT_PUBLIC_ADMIN_USER_ID
--    from all environment configs.

COMMENT ON COLUMN profiles.is_admin IS
  'Server-side admin flag. Evaluated via service-role key only — never exposed to the client.';
