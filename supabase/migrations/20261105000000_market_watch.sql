-- Market Watch: one snapshot per founder, project and week. REVIEW BEFORE APPLYING.
-- Written and read only by server code that checks ownership (service role). Idempotent.
create table if not exists public.market_watch_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  project_id  uuid,
  week_start  date not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists market_watch_snapshots_week_idx
  on public.market_watch_snapshots (user_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), week_start);
create index if not exists market_watch_snapshots_user_idx on public.market_watch_snapshots (user_id, created_at desc);
alter table public.market_watch_snapshots enable row level security;
