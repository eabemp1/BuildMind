-- 20260517000004_funnel_events.sql
-- Growth Improvement #5: Server-side onboarding funnel tracking
-- All funnel events from the client are persisted here for real analytics.
-- The admin dashboard reads /api/analytics/funnel to see drop-off rates.

create table if not exists funnel_events (
  id         bigserial    primary key,
  user_id    uuid         references auth.users(id) on delete set null,
  step       text         not null,
  meta       jsonb,
  session_id text,        -- client-generated session id for multi-step attribution
  referrer   text,        -- referring URL for source attribution
  user_agent text,        -- truncated UA string for device segmentation
  created_at timestamptz  not null default now()
);

-- Index for per-step counts (used by admin analytics query)
create index if not exists idx_funnel_events_step_created
  on funnel_events (step, created_at desc);

-- Index for per-user funnel (used to find where a specific user dropped off)
create index if not exists idx_funnel_events_user_id
  on funnel_events (user_id, created_at asc)
  where user_id is not null;

-- RLS
alter table funnel_events enable row level security;

-- Authenticated users can insert their own events
create policy "funnel_events_insert_authenticated"
  on funnel_events for insert to authenticated
  with check (auth.uid() = user_id or user_id is null);

-- No user reads — admin only via service role
create policy "funnel_events_no_select"
  on funnel_events for select to authenticated
  using (false);

-- Anon can insert (for pre-auth funnel steps like landing page visit)
create policy "funnel_events_insert_anon"
  on funnel_events for insert to anon
  with check (user_id is null);

comment on table funnel_events is
  'Server-side onboarding funnel events. See /api/analytics/funnel and Growth Improvement #5.';
