-- Real-world signals that do not depend on what a founder types.
--   * reflexion_learning_log records HOW MUCH a signal can be trusted (verified / proof / self) and the proof.
--   * signal_links: tracked links and hosted signup pages. BuildMind counts visits and signups itself.
--   * signal_events: what those links observed. Unique visitors and unique emails only.
-- Idempotent: safe to run more than once. Requires 20261022020000_outcome_signals.sql.

alter table public.reflexion_learning_log add column if not exists signal_trust text;
alter table public.reflexion_learning_log add column if not exists signal_proof text;
alter table public.reflexion_learning_log add column if not exists signal_proof_hash text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reflexion_learning_log_signal_trust_chk') then
    alter table public.reflexion_learning_log
      add constraint reflexion_learning_log_signal_trust_chk
      check (signal_trust is null or signal_trust in ('verified','proof','self'));
  end if;
  -- 'visit' is a new kind: replace the old list.
  alter table public.reflexion_learning_log drop constraint if exists reflexion_learning_log_signal_kind_chk;
  alter table public.reflexion_learning_log
    add constraint reflexion_learning_log_signal_kind_chk
    check (signal_kind is null or signal_kind in ('none','reply','conversation','signup','call','payment','visit','other'));
end $$;

-- One piece of proof backs one outcome. The same link or pasted reply cannot be reused for another task.
create unique index if not exists reflexion_learning_log_user_proof_hash
  on public.reflexion_learning_log (user_id, signal_proof_hash)
  where signal_proof_hash is not null;

-- Signals recorded before this migration were typed claims with nothing behind them.
update public.reflexion_learning_log
   set signal_trust = case when signal_source = 'auto' then 'verified' else 'self' end
 where signal_kind is not null and signal_trust is null;

create table if not exists public.signal_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  project_id  uuid,
  code        text not null unique,
  kind        text not null check (kind in ('link','interest')),
  label       text,
  target_url  text,
  headline    text,
  pitch       text,
  created_at  timestamptz not null default now()
);
create index if not exists signal_links_user_idx on public.signal_links (user_id, created_at desc);

create table if not exists public.signal_events (
  id           uuid primary key default gen_random_uuid(),
  link_id      uuid not null references public.signal_links(id) on delete cascade,
  user_id      uuid not null,
  event        text not null check (event in ('visit','signup')),
  visitor_hash text,
  email        text,
  created_at   timestamptz not null default now()
);
create unique index if not exists signal_events_one_visit_per_visitor
  on public.signal_events (link_id, visitor_hash) where event = 'visit' and visitor_hash is not null;
create unique index if not exists signal_events_one_signup_per_email
  on public.signal_events (link_id, lower(email)) where event = 'signup' and email is not null;
create index if not exists signal_events_user_time_idx on public.signal_events (user_id, created_at desc);

alter table public.signal_links  enable row level security;
alter table public.signal_events enable row level security;
-- No policies: only the server (service role) reads and writes these tables.
