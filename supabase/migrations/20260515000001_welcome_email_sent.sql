-- Migration: 20260515000001_welcome_email_sent.sql
--
-- Adds welcome_email_sent boolean to profiles so the welcome email
-- is sent exactly once per user regardless of page refreshes or retries.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS welcome_email_sent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.welcome_email_sent IS
  'Set to true after POST /api/user/welcome-email succeeds. '
  'Prevents duplicate welcome emails on onboarding page refreshes.';
