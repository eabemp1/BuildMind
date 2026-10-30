-- One founder-reported 90-day goal per project, shown in the Today Path card.
create table if not exists public.project_goals (
  project_id uuid primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vision text,
  goal_label text not null check (char_length(goal_label) between 3 and 60),
  goal_target integer not null check (goal_target between 1 and 9999),
  goal_current integer not null default 0 check (goal_current between 0 and 9999),
  ends_at timestamptz not null default (now() + interval '90 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_goals_user_id_idx on public.project_goals(user_id);

alter table public.project_goals enable row level security;

drop policy if exists "Users can manage their own project goals" on public.project_goals;
create policy "Users can manage their own project goals"
  on public.project_goals
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
