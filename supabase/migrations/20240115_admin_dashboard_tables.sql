-- Migration: Admin Dashboard Tables
-- Created: 2024-01-01
-- Purpose: Support admin dashboard Phase 1 components

-- ============================================================================
-- TABLE: paystack_events (webhook event log)
-- ============================================================================
create table if not exists paystack_events (
  id            bigserial primary key,
  event         text not null,
  customer_email text,
  amount        bigint,          -- in kobo/cents
  status        text default 'pending',
  reference     text,
  raw_payload   jsonb,
  received_at   timestamptz default now()
);

create index if not exists idx_paystack_events_received on paystack_events(received_at desc);
create index if not exists idx_paystack_events_event on paystack_events(event);
create index if not exists idx_paystack_events_status on paystack_events(status);

-- ============================================================================
-- TABLE: onboarding_events (funnel aggregation)
-- ============================================================================
create table if not exists onboarding_events (
  step       text primary key,
  count      bigint default 0,
  updated_at timestamptz default now()
);

-- ============================================================================
-- TABLE: briefing_opens (morning briefing tracking)
-- ============================================================================
create table if not exists briefing_opens (
  id        bigserial primary key,
  user_id   uuid references auth.users(id) on delete cascade,
  opened_at timestamptz default now()
);

create index if not exists idx_briefing_opens_user on briefing_opens(user_id, opened_at desc);
create index if not exists idx_briefing_opens_opened on briefing_opens(opened_at desc);

-- ============================================================================
-- FUNCTION: increment_funnel_step (upsert helper)
-- ============================================================================
create or replace function increment_funnel_step(p_step text)
returns void language plpgsql as $$
begin
  insert into onboarding_events (step, count, updated_at)
  values (p_step, 1, now())
  on conflict (step) do update
    set count = onboarding_events.count + 1,
        updated_at = now();
end;
$$;

-- ============================================================================
-- ALTER: founder_context (add task counters if missing)
-- ============================================================================
alter table if exists founder_context
  add column if not exists tasks_completed integer default 0,
  add column if not exists tasks_generated integer default 0;
