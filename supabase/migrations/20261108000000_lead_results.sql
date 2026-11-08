-- Lead Finder + customer map. REVIEW BEFORE APPLYING. Idempotent.
-- lead_results: leads a founder saved and what happened. Server code only (service role), checks ownership.
create table if not exists public.lead_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  project_id  uuid,
  country     text not null default '',
  city        text not null default '',
  lead_name   text not null,
  lead_kind   text not null default 'page',
  lead_url    text not null,
  payload     jsonb not null default '{}'::jsonb,
  channel     text,
  status      text not null default 'saved' check (status in ('saved','contacted','replied','converted','no_reply','not_a_fit')),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists lead_results_unique_idx
  on public.lead_results (user_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), lead_url);
create index if not exists lead_results_user_idx on public.lead_results (user_id, created_at desc);
alter table public.lead_results enable row level security;

-- customer_map: what is working in each country, with no names or links.
-- A row appears only when at least 3 different founders contributed, so nobody can be singled out.
create or replace view public.customer_map as
select
  lower(country)                                         as country,
  lead_kind,
  coalesce(channel, 'unknown')                           as channel,
  count(distinct user_id)                                as founders,
  count(*) filter (where status in ('contacted','replied','converted','no_reply')) as contacted,
  count(*) filter (where status in ('replied','converted'))                        as replied,
  count(*) filter (where status = 'converted')                                     as converted
from public.lead_results
where country <> ''
group by 1, 2, 3
having count(distinct user_id) >= 3;
revoke all on public.customer_map from anon, authenticated;
