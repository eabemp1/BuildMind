create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'user',
  is_active boolean not null default true,
  onboarding_completed boolean not null default false,
  notify_milestone boolean not null default true,
  notify_task boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text,
  target_users text,
  problem text,
  validation_strengths text[] not null default '{}',
  validation_weaknesses text[] not null default '{}',
  validation_suggestions text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  stage text not null,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones(id) on delete cascade,
  title text not null,
  notes text,
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  month text not null,
  count int not null default 0,
  tokens_used bigint not null default 0,
  last_activity timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_milestones_project_id on public.milestones(project_id);
create index if not exists idx_tasks_milestone_id on public.tasks(milestone_id);
create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_ai_usage_user_month on public.ai_usage(user_id, month);

alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks enable row level security;
alter table public.notifications enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "users_self_select" on public.users;
create policy "users_self_select" on public.users for select using (auth.uid() = id);
drop policy if exists "users_self_update" on public.users;
create policy "users_self_update" on public.users for update using (auth.uid() = id);
drop policy if exists "users_self_insert" on public.users;
create policy "users_self_insert" on public.users for insert with check (auth.uid() = id);

drop policy if exists "projects_owner_all" on public.projects;
create policy "projects_owner_all" on public.projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "milestones_owner_all" on public.milestones;
create policy "milestones_owner_all" on public.milestones
for all using (
  exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  )
);

drop policy if exists "tasks_owner_all" on public.tasks;
create policy "tasks_owner_all" on public.tasks
for all using (
  exists (
    select 1
    from public.milestones m
    join public.projects p on p.id = m.project_id
    where m.id = milestone_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.milestones m
    join public.projects p on p.id = m.project_id
    where m.id = milestone_id and p.user_id = auth.uid()
  )
);

drop policy if exists "notifications_owner_all" on public.notifications;
create policy "notifications_owner_all" on public.notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ai_usage_owner_all" on public.ai_usage;
create policy "ai_usage_owner_all" on public.ai_usage for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

