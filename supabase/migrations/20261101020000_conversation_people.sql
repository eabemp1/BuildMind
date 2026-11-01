-- Founder-owned people and notes for the customer-conversation tracker.
create table if not exists public.conversation_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  where_found text,
  link text,
  status text not null default 'to_contact'
    check (status in ('to_contact', 'sent', 'replied', 'booked', 'done', 'no_reply')),
  contacted_at timestamptz,
  message text,
  notes text,
  insights jsonb not null default '[]'::jsonb
    check (jsonb_typeof(insights) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversation_people_user_updated_idx
  on public.conversation_people(user_id, updated_at desc);

create index if not exists conversation_people_follow_up_idx
  on public.conversation_people(user_id, contacted_at)
  where status = 'sent';

alter table public.conversation_people enable row level security;

drop policy if exists "Users can manage their own conversation people" on public.conversation_people;
create policy "Users can manage their own conversation people"
  on public.conversation_people
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
