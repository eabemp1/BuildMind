-- Demand Check runs (public posts showing people already want something). REVIEW BEFORE APPLYING. Idempotent.
create table if not exists public.demand_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  project_id  uuid,
  status      text not null default 'running' check (status in ('running','done','failed')),
  input       jsonb not null default '{}'::jsonb,
  result      jsonb not null default '{}'::jsonb,
  signal_count integer not null default 0,
  error       text,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists demand_runs_user_idx on public.demand_runs (user_id, created_at desc);
alter table public.demand_runs enable row level security;
