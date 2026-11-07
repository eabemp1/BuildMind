-- Competitors a founder chose to watch themselves (Market Watch). Read and written only through
-- /api/market-watch/competitors, which checks ownership. Idempotent.
create table if not exists public.market_watch_competitors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  project_id  uuid,
  name        text not null,
  url         text not null,
  host        text not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists market_watch_competitors_host_idx
  on public.market_watch_competitors (user_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), host);
create index if not exists market_watch_competitors_user_idx on public.market_watch_competitors (user_id, created_at);
alter table public.market_watch_competitors enable row level security;
