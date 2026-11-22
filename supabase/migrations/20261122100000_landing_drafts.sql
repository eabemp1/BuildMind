-- Saved, unpublished landing page designs (look, sections, images) for a Work draft. Reached only through the API.
create table if not exists public.landing_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  project_id uuid,
  content jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key)
);
alter table public.landing_drafts enable row level security;
