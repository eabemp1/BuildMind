-- Radar checks for opportunities on its own, about twice a week. Idempotent.
create table if not exists public.radar_settings (
  user_id            uuid primary key,
  auto_discover      boolean not null default true,
  where_text         text,
  last_auto_run_at   timestamptz,
  last_auto_added    integer not null default 0,
  last_auto_note     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.radar_settings enable row level security;
