-- One row per heavy job (lead search, demand check, agent run, work draft): estimated model use. REVIEW BEFORE APPLYING. Idempotent.
-- Token counts are estimates (characters / 4), not provider-billed figures.
create table if not exists public.job_costs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  kind        text not null,
  job_id      text,
  calls       integer not null default 0,
  approx_in_tokens  integer not null default 0,
  approx_out_tokens integer not null default 0,
  providers   jsonb not null default '[]'::jsonb,
  ms          integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists job_costs_user_idx on public.job_costs (user_id, created_at desc);
create index if not exists job_costs_kind_idx on public.job_costs (kind, created_at desc);
alter table public.job_costs enable row level security;
-- No policies: written and read by the server (service role) only.
