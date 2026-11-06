-- Break My Startup history: each finished stress test is kept so a founder can reopen it
-- without running the AI again. Read and written only through /api/break-runs, which checks ownership. Idempotent.
create table if not exists public.break_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  project_id  uuid,
  idea        text not null,
  verdict     text,
  survival    integer,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists break_runs_user_idx on public.break_runs (user_id, created_at desc);
alter table public.break_runs enable row level security;
