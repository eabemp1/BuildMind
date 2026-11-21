-- Offer pages: one short page built from a customer quote the founder approved, shared by a link the founder chooses to publish.
-- REVIEW BEFORE APPLYING. Idempotent. Existing rows are untouched. Read and written by the server (service role) only:
-- row level security is on and there are no policies, so the anon and authenticated keys cannot read or write it.
create table if not exists public.offer_pages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  project_id   uuid,
  person_id    uuid,
  slug         text not null unique,
  status       text not null default 'draft' check (status in ('draft','published')),
  content      jsonb not null default '{}'::jsonb,
  views        integer not null default 0,
  clicks       integer not null default 0,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists offer_pages_user_idx on public.offer_pages (user_id, updated_at desc);
alter table public.offer_pages enable row level security;

-- Atomic counters, callable by the server only.
create or replace function public.bm_offer_count(p_slug text, p_kind text) returns void
language sql security invoker set search_path = public as $$
  update public.offer_pages
     set views  = views  + (case when p_kind = 'view'  then 1 else 0 end),
         clicks = clicks + (case when p_kind = 'click' then 1 else 0 end)
   where slug = p_slug and status = 'published';
$$;
revoke all on function public.bm_offer_count(text, text) from public, anon, authenticated;
grant execute on function public.bm_offer_count(text, text) to service_role;
