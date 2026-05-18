-- 20260517000002_teams_waitlist.sql
-- Growth Improvement #3: Teams waitlist
-- Captures demand for "BuildMind for Teams" before the feature exists.

create table if not exists teams_waitlist (
  id           bigserial    primary key,
  email        text         not null unique,
  use_case     text,        -- co-founders | small_team | investor_updates | other
  team_size    smallint,
  user_id      uuid         references auth.users(id) on delete set null,
  submitted_at timestamptz  not null default now(),
  notified_at  timestamptz  -- set when early-access email is sent at launch
);

create index if not exists idx_teams_waitlist_submitted_at on teams_waitlist (submitted_at desc);

-- No RLS — service role only (no user needs to read their own waitlist row)
alter table teams_waitlist enable row level security;

-- Users can insert their own entry
create policy "teams_waitlist_insert"
  on teams_waitlist for insert to authenticated
  with check (true);

-- Users cannot read any rows
create policy "teams_waitlist_no_select"
  on teams_waitlist for select to authenticated
  using (false);

comment on table teams_waitlist is
  'Teams early-access waitlist. See /api/waitlist/teams and Growth Improvement #3.';
