-- Align live Supabase tables with the current BuildMind frontend/API schema.
-- Safe to run more than once.

create extension if not exists pgcrypto;

alter table if exists projects
  add column if not exists title text,
  add column if not exists name text,
  add column if not exists industry text,
  add column if not exists target_market text,
  add column if not exists problem_type text,
  add column if not exists revenue_model text,
  add column if not exists startup_stage text default 'Idea',
  add column if not exists target_users text,
  add column if not exists problem text,
  add column if not exists validation_score int,
  add column if not exists execution_score int,
  add column if not exists momentum_score int default 50,
  add column if not exists validation_strengths text[] default '{}',
  add column if not exists validation_weaknesses text[] default '{}',
  add column if not exists validation_suggestions text[] default '{}',
  add column if not exists domain text,
  add column if not exists score int,
  add column if not exists streak int default 0,
  add column if not exists updated_at timestamptz default now();

update projects
set
  title = coalesce(title, name, 'Untitled project'),
  name = coalesce(name, title, 'Untitled project'),
  startup_stage = coalesce(startup_stage, 'Idea'),
  validation_strengths = coalesce(validation_strengths, '{}'),
  validation_weaknesses = coalesce(validation_weaknesses, '{}'),
  validation_suggestions = coalesce(validation_suggestions, '{}'),
  momentum_score = coalesce(momentum_score, 50),
  streak = coalesce(streak, 0)
where title is null
   or name is null
   or startup_stage is null
   or validation_strengths is null
   or validation_weaknesses is null
   or validation_suggestions is null
   or momentum_score is null
   or streak is null;

alter table if exists milestones
  add column if not exists user_id uuid,
  add column if not exists title text,
  add column if not exists stage text,
  add column if not exists order_index int default 0,
  add column if not exists is_completed boolean default false,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz default now();

update milestones m
set user_id = p.user_id
from projects p
where m.project_id = p.id
  and m.user_id is null;

update milestones
set
  title = coalesce(title, stage, status, 'Milestone'),
  stage = coalesce(stage, title, status, 'Milestone'),
  order_index = coalesce(order_index, 0),
  is_completed = coalesce(is_completed, status = 'completed'),
  completed_at = case
    when coalesce(is_completed, false) and completed_at is null then updated_at
    else completed_at
  end
where title is null
   or stage is null
   or order_index is null
   or is_completed is null;

alter table if exists tasks
  add column if not exists user_id uuid,
  add column if not exists title text,
  add column if not exists notes text,
  add column if not exists is_completed boolean default false,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz default now();

update tasks t
set user_id = m.user_id
from milestones m
where t.milestone_id = m.id
  and t.user_id is null;

update tasks
set
  title = coalesce(title, description, 'Task'),
  is_completed = coalesce(is_completed, status = 'completed'),
  completed_at = case
    when coalesce(is_completed, false) and completed_at is null then updated_at
    else completed_at
  end
where title is null
   or is_completed is null;

alter table if exists ai_usage
  add column if not exists month text,
  add column if not exists count int default 0;

create table if not exists push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz default now(),
  unique(user_id)
);

alter table push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'Users manage own subscription'
  ) then
    create policy "Users manage own subscription"
      on push_subscriptions
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists projects_user_created_idx on projects (user_id, created_at desc);
create index if not exists milestones_project_order_idx on milestones (project_id, order_index);
create index if not exists tasks_milestone_created_idx on tasks (milestone_id, created_at);
