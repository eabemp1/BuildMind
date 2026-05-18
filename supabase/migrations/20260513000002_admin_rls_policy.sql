-- Migration: 20260513000002_admin_rls_policy.sql
--
-- Adds a Row Level Security policy that restricts admin data routes at the
-- database layer, not just at the API layer.
--
-- Previously, admin auth relied solely on the application-level
-- isAdminUser() check in lib/server/adminAuth.ts. If that check were
-- bypassed (e.g. a misconfigured middleware or direct Supabase query from a
-- client with the anon key), admin data would be readable by any
-- authenticated user.
--
-- This migration adds:
-- 1. An RLS policy on profiles so that non-admin users cannot read other
--    profiles' is_admin flag via the anon/authenticated role.
-- 2. An admin_audit_log table for tracking admin actions (plan overrides,
--    manual is_admin grants) so there is a durable record of who changed what.
--
-- NOTE: The service-role key (used in adminAuth.ts) bypasses RLS by design.
-- These policies only protect access via the anon or authenticated role.

-- ── 1. Harden profiles RLS ────────────────────────────────────────────────────
-- The existing policy "profiles_own_data" allows SELECT WHERE auth.uid() = id.
-- That already means users cannot see each other's rows at all. This is correct.
-- We add an explicit policy name to make intent auditable.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_self_only'
  ) THEN
    -- Drop the old unnamed / differently-named policy if present
    DROP POLICY IF EXISTS profiles_own_data ON profiles;

    CREATE POLICY profiles_self_only ON profiles
      FOR ALL
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ── 2. Prevent any authenticated user from updating their own is_admin flag ───
-- Even with the SELECT policy above, an UPDATE could theoretically flip
-- is_admin to true if the WITH CHECK were too permissive. Lock it down.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_cannot_self_promote_admin'
  ) THEN
    CREATE POLICY profiles_cannot_self_promote_admin ON profiles
      AS RESTRICTIVE
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (
        -- The user can update their own row BUT only if is_admin stays the same.
        -- is_admin can only be changed via the service-role key (bypasses RLS).
        is_admin = (SELECT is_admin FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ── 3. Admin audit log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid        NOT NULL,           -- who performed the action
  action      text        NOT NULL,           -- e.g. 'plan_override', 'grant_admin'
  target_id   uuid,                           -- user/resource affected
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Service-role only — never exposed to authenticated/anon roles
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_audit_log_no_client_access ON admin_audit_log
  AS RESTRICTIVE
  FOR ALL
  USING (false);   -- blocks all anon + authenticated access; service_role bypasses

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id
  ON admin_audit_log(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_id
  ON admin_audit_log(target_id, created_at DESC);

COMMENT ON TABLE admin_audit_log IS
  'Append-only log of all admin actions. Written by server routes using '
  'the service-role key. Not readable by any client role.';
