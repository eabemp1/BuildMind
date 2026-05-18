alter table founder_context
add column if not exists tasks_completed_today integer default 0,
add column if not exists last_task_date date,
add column if not exists daily_tasks_reset_at timestamptz,
add column if not exists ai_messages_today integer default 0,
add column if not exists last_ai_date date;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Avatar upload: own file only') then
    DROP POLICY IF EXISTS "Avatar upload: own file only" ON storage.objects;
    create policy "Avatar upload: own file only"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Avatar update: own file only') then
    DROP POLICY IF EXISTS "Avatar update: own file only" ON storage.objects;
    create policy "Avatar update: own file only"
    on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Avatar delete: own file only') then
    DROP POLICY IF EXISTS "Avatar delete: own file only" ON storage.objects;
    create policy "Avatar delete: own file only"
    on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Avatar read: public') then
    DROP POLICY IF EXISTS "Avatar read: public" ON storage.objects;
    create policy "Avatar read: public"
    on storage.objects for select to public
    using (bucket_id = 'avatars');
  end if;
end $$;

create table if not exists ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  call_count integer not null default 0,
  updated_at timestamptz default now(),
  primary key (user_id, month)
);

alter table ai_usage enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_usage' and policyname = 'ai_usage: own rows only') then
    DROP POLICY IF EXISTS "ai_usage: own rows only" ON ai_usage;
    create policy "ai_usage: own rows only" on ai_usage
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

