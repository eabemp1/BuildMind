-- Canonical streak rule (see lib/streak.ts).
--
-- REVIEW BEFORE APPLYING: update_streak_atomic was created outside this repo's
-- migrations folder, so compare this against the live definition first
-- (select pg_get_functiondef('update_streak_atomic(uuid,uuid,date)'::regprocedure);).
-- The signature and return type match how the app calls it.
--
-- Rule: same day -> unchanged; the day after the last extended day -> +1;
-- anything else (gap, or first ever) -> 1. No hidden "freeze".

create or replace function public.update_streak_atomic(
  p_user_id uuid,
  p_project_id uuid,
  p_today date
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_streak integer;
  v_last   date;
  v_new    integer;
begin
  -- Callers pass their own id; refuse anything else when a JWT is present.
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'not allowed';
  end if;

  insert into founder_context (user_id) values (p_user_id) on conflict (user_id) do nothing;

  select coalesce(streak, 0), last_checkin_date::date
    into v_streak, v_last
    from founder_context where user_id = p_user_id for update;

  if v_last is not null and v_last = p_today then
    v_new := greatest(v_streak, 1);
  elsif v_last is not null and v_last = p_today - 1 then
    v_new := v_streak + 1;
  else
    v_new := 1;
  end if;

  update founder_context
     set streak = v_new, last_checkin_date = p_today, updated_at = now()
   where user_id = p_user_id;

  if p_project_id is not null then
    update projects set streak = v_new where id = p_project_id and user_id = p_user_id;
  end if;

  return v_new;
end;
$$;

grant execute on function public.update_streak_atomic(uuid, uuid, date) to authenticated, service_role;
