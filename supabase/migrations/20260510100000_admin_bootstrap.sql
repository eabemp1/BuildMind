-- Migration: 20260510100000_admin_bootstrap.sql
--
-- Bootstraps the first admin user so the admin panel is accessible after a
-- fresh deploy. Without this, is_admin = true must be set manually via the
-- Supabase dashboard before anyone can use the admin routes.
--
-- HOW TO USE:
--   1. Set ADMIN_EMAIL to the email address you registered with.
--   2. Run this file via `supabase db push` or paste into the Supabase SQL editor.
--
-- Re-running this migration is safe — the UPDATE is a no-op if the user is
-- already an admin or the email does not exist.
--
-- To add additional admins later, repeat the UPDATE with the new email, or use:
--   UPDATE public.profiles SET is_admin = true
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'newadmin@example.com');

DO $$
DECLARE
  v_admin_email TEXT := current_setting('app.admin_email', true);
  v_user_id UUID;
BEGIN
  -- Resolve the email to a user ID from auth.users
  IF v_admin_email IS NOT NULL AND v_admin_email <> '' THEN
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = v_admin_email
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
      UPDATE public.profiles
      SET is_admin = true
      WHERE id = v_user_id AND (is_admin IS NULL OR is_admin = false);

      RAISE NOTICE 'Admin bootstrapped for % (user_id: %)', v_admin_email, v_user_id;
    ELSE
      RAISE NOTICE 'Admin bootstrap skipped: no user found with email %', v_admin_email;
    END IF;
  ELSE
    RAISE NOTICE 'Admin bootstrap skipped: app.admin_email not set. '
      'Run: ALTER DATABASE postgres SET app.admin_email = ''you@example.com''; '
      'then re-apply this migration, or set is_admin=true manually in the Supabase dashboard.';
  END IF;
END $$;
