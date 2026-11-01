-- Drafts prepared in the Work library. Drafts are private to their founder.
create table if not exists public.work_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  kind text not null check (char_length(kind) between 1 and 80),
  title text not null check (char_length(title) between 1 and 200),
  inputs jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  edits jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'used', 'sent')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_items_user_updated_idx
  on public.work_items(user_id, updated_at desc);

create index if not exists work_items_project_idx
  on public.work_items(project_id)
  where project_id is not null;

alter table public.work_items enable row level security;

drop policy if exists "Users can manage their own work items" on public.work_items;
create policy "Users can manage their own work items"
  on public.work_items
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
