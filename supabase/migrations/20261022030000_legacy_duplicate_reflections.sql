-- Legacy duplicate reflections: a double-tapped or retried submit used to save the same reflection twice
-- (the idempotency key and the 60-second guard only protect new writes). Duplicates skew pattern counts
-- and the learning loop.
--
-- This migration deletes NOTHING by itself. It adds a function you run on purpose:
--
--   select * from public.dedupe_legacy_reflections(true);   -- dry run: what it WOULD remove
--   select * from public.dedupe_legacy_reflections(false);  -- removes them, after copying to a backup table
--
-- A row counts as a duplicate only when every content field is identical to the previous reflection by the
-- same user (same project, task text, outcome, note and the three "what" fields) AND it was saved within
-- 2 minutes of it AND it has no idempotency key. The earliest row of each group is kept. Removed rows are
-- copied to public.reflections_dedupe_backup first, so the change can be undone with an INSERT ... SELECT.
-- Idempotent: safe to run more than once.

create table if not exists public.reflections_dedupe_backup as
  select r.*, now() as removed_at from public.reflections r where false;

create or replace function public.dedupe_legacy_reflections(dry_run boolean default true)
returns table (duplicate_rows bigint, removed boolean)
language plpgsql
security invoker
as $fn$
declare
  ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into ids
  from (
    select id,
           created_at,
           lag(created_at) over (
             partition by user_id,
                          coalesce(project_id::text, ''),
                          coalesce(today_action, ''),
                          coalesce(outcome, ''),
                          coalesce(note, ''),
                          coalesce(what_tried, ''),
                          coalesce(what_happened, ''),
                          coalesce(what_learned, '')
             order by created_at, id
           ) as prev_at,
           idempotency_key
    from public.reflections
  ) d
  where d.idempotency_key is null
    and d.prev_at is not null
    and d.created_at - d.prev_at <= interval '2 minutes';

  if dry_run then
    return query select coalesce(array_length(ids, 1), 0)::bigint, false;
    return;
  end if;

  if coalesce(array_length(ids, 1), 0) > 0 then
    insert into public.reflections_dedupe_backup
      select r.*, now() from public.reflections r where r.id = any(ids);
    delete from public.reflections where id = any(ids);
  end if;
  return query select coalesce(array_length(ids, 1), 0)::bigint, true;
end;
$fn$;
