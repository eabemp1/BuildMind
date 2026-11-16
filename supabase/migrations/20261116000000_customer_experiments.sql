-- Customer experiments: one question the founder is testing with real people, and what actually happened.
-- REVIEW BEFORE APPLYING. Idempotent. Read and written by the server (service role) only.
create table if not exists public.customer_experiments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  project_id    uuid,
  goal          text not null,
  hypothesis    text not null default '',
  audience      text not null default '',
  plan          text not null default '',
  status        text not null default 'running' check (status in ('running','decided','archived')),
  decision      text check (decision in ('continue','change_message','change_audience','test_other','stop')),
  decision_note text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists customer_experiments_user_idx on public.customer_experiments (user_id, updated_at desc);
create index if not exists customer_experiments_project_idx on public.customer_experiments (project_id, updated_at desc);

create table if not exists public.experiment_events (
  id            uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.customer_experiments(id) on delete cascade,
  user_id       uuid not null,
  who           text not null default '',
  kind          text not null check (kind in ('prepared','sent','replied','no_reply','blocked','note')),
  detail        text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists experiment_events_exp_idx on public.experiment_events (experiment_id, created_at);
create index if not exists experiment_events_user_idx on public.experiment_events (user_id, created_at desc);

alter table public.customer_experiments enable row level security;
alter table public.experiment_events enable row level security;
-- No policies: the app reads and writes these with the service role after checking ownership.
