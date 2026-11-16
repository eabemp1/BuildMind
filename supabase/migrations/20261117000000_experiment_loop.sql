-- Evidence -> offer -> action -> outcome loop, inside Customer Experiments.
-- REVIEW BEFORE APPLYING. Idempotent. Needs 20261116000000_customer_experiments.sql first. Existing rows are untouched.

-- 1. Outcomes: more distinct results, retry-safe writes, corrections that keep the original, and a synthetic flag.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.experiment_events'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table public.experiment_events drop constraint %I', c);
  end loop;
  alter table public.experiment_events add constraint experiment_events_kind_check
    check (kind in ('prepared','sent','replied','no_reply','blocked','conversation','declined','pilot_agreed','would_pay','paid','delivered','note','retracted'));
end $$;

alter table public.experiment_events add column if not exists client_key  text;
alter table public.experiment_events add column if not exists corrects_id  uuid references public.experiment_events(id);
alter table public.experiment_events add column if not exists synthetic    boolean not null default false;
create unique index if not exists experiment_events_client_key_uq on public.experiment_events (user_id, client_key) where client_key is not null;
-- An entry can be corrected once; the correction itself can be corrected. History is never rewritten.
create unique index if not exists experiment_events_corrects_uq on public.experiment_events (corrects_id) where corrects_id is not null;

-- 2. The stage the founder is really at (optional; otherwise taken from the project).
alter table public.customer_experiments add column if not exists stage text check (stage in ('idea','validation','build','first_revenue','after_revenue'));

-- 3. Evidence: what the founder knows, reports or only assumes.
create table if not exists public.experiment_evidence (
  id            uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.customer_experiments(id) on delete cascade,
  user_id       uuid not null,
  kind          text not null check (kind in ('conversation','enquiry','observation','assumption')),
  status        text not null check (status in ('assumption','founder_report','observed')),
  note          text not null default '',
  source        text not null default '',
  source_date   date,
  last_checked  timestamptz,
  synthetic     boolean not null default false,
  client_key    text,
  created_at    timestamptz not null default now()
);
create index if not exists experiment_evidence_exp_idx on public.experiment_evidence (experiment_id, created_at);
create unique index if not exists experiment_evidence_client_key_uq on public.experiment_evidence (user_id, client_key) where client_key is not null;

-- 4. Offers: versioned, never overwritten.
create table if not exists public.experiment_offers (
  id               uuid primary key default gen_random_uuid(),
  experiment_id    uuid not null references public.customer_experiments(id) on delete cascade,
  user_id          uuid not null,
  version          integer not null,
  problem          text not null default '',
  solution         text not null default '',
  availability     text not null default '',
  scope            text not null default '',
  proof            text not null default '',
  price_hypothesis text not null default '',
  evidence_ids     uuid[] not null default '{}',
  synthetic        boolean not null default false,
  client_key       text,
  created_at       timestamptz not null default now(),
  unique (experiment_id, version)
);
create unique index if not exists experiment_offers_client_key_uq on public.experiment_offers (user_id, client_key) where client_key is not null;

-- 5. Row-level security. The app writes with the service role after checking ownership; these policies let a
--    signed-in founder read only their own rows, and nothing else.
alter table public.customer_experiments enable row level security;
alter table public.experiment_events    enable row level security;
alter table public.experiment_evidence  enable row level security;
alter table public.experiment_offers    enable row level security;
do $$
declare t text;
begin
  foreach t in array array['customer_experiments','experiment_events','experiment_evidence','experiment_offers'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_owner_read') then
      execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || '_owner_read', t);
    end if;
  end loop;
end $$;
