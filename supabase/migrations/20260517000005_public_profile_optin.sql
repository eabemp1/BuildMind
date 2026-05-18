-- 20260517000005_public_profile_optin.sql
-- Product Improvement #9: Public Founder Score (feature flag off — UI + backend ready)
-- Adds opt-in columns to profiles so founders control their public visibility.

alter table profiles
  add column if not exists public_profile  boolean      not null default false,
  add column if not exists username        text         unique,
  add column if not exists joined_at       timestamptz  not null default now();

-- Index for username lookups (public profile page)
create index if not exists idx_profiles_username
  on profiles (username)
  where public_profile = true;

comment on column profiles.public_profile is
  'Founder opted in to public /founder/[username] profile. Default false. See FEATURES.publicFounderScore.';
comment on column profiles.username is
  'URL-safe handle for /founder/[username] page. Unique. Set via settings when opting in.';
