-- Task integrity: is_completed, status and completed_at must always agree.
--
-- Before this, three code paths set is_completed without completed_at, and one without status, so the database held
-- tasks that were "done" but had no completion time (breaks rolling velocity) or were done but still said "pending"
-- (looks like unfinished work inside a completed milestone). A trigger makes the three columns agree no matter which
-- code path (or manual edit) writes the row. Idempotent: safe to run twice.

alter table tasks add column if not exists completed_at timestamptz;

create or replace function tasks_sync_completion() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_completed, false) then
      new.status := 'completed';
      new.completed_at := coalesce(new.completed_at, now());
    elsif new.status = 'completed' then
      new.is_completed := true;
      new.completed_at := coalesce(new.completed_at, now());
    end if;
    return new;
  end if;

  -- UPDATE: whichever column the writer changed leads; the others follow.
  if new.is_completed is distinct from old.is_completed then
    if coalesce(new.is_completed, false) then
      new.status := 'completed';
      new.completed_at := coalesce(new.completed_at, now());
    else
      if old.status = 'completed' and new.status = 'completed' then new.status := 'pending'; end if;
      new.completed_at := null;
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'completed' then
      new.is_completed := true;
      new.completed_at := coalesce(new.completed_at, now());
    elsif old.status = 'completed' then
      new.is_completed := false;
      new.completed_at := null;
    end if;
  elsif coalesce(new.is_completed, false) and new.completed_at is null then
    new.completed_at := coalesce(old.updated_at, now());
  end if;
  return new;
end $$;

drop trigger if exists tasks_sync_completion_trg on tasks;
create trigger tasks_sync_completion_trg
  before insert or update on tasks
  for each row execute function tasks_sync_completion();

-- Repair existing rows (the trigger only fires on writes).
-- 1. Done but no completion time: use the last time the row was touched, the best evidence there is.
update tasks set completed_at = coalesce(updated_at, created_at, now())
where coalesce(is_completed, false) and completed_at is null;
-- 2. Done but still labelled open.
update tasks set status = 'completed'
where coalesce(is_completed, false) and status is distinct from 'completed' and status is distinct from 'blocked';
-- 3. Labelled completed but is_completed is false.
update tasks set is_completed = true, completed_at = coalesce(completed_at, updated_at, now())
where status = 'completed' and not coalesce(is_completed, false);
