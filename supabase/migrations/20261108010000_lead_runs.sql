-- Lead Finder runs, so a search can finish in the background while the founder uses other pages. REVIEW BEFORE APPLYING. Idempotent.
create table if not exists public.lead_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  project_id  uuid,
  status      text not null default 'running' check (status in ('running','done','failed')),
  input       jsonb not null default '{}'::jsonb,
  stats       jsonb not null default '{}'::jsonb,
  lead_count  integer not null default 0,
  reason      text,
  error       text,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists lead_runs_user_idx on public.lead_runs (user_id, created_at desc);
alter table public.lead_runs enable row level security;
