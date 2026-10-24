-- Quiet days: a founder can rest one day without losing the streak.
--
-- founder_context.quiet_days holds the dates the founder chose to rest (the app allows at most one in any
-- 7 days, see lib/quietDays.ts). update_streak_atomic then bridges a gap made only of quiet days:
-- last check-in Mon, quiet Tue, check-in Wed -> streak + 1 (the quiet day itself does not add to the count).
-- Everything else is unchanged from 20261005000000_canonical_streak_rule.sql: same day -> unchanged,
-- the next day -> +1, any other gap -> 1.
--
-- REVIEW BEFORE APPLYING: this replaces update_streak_atomic, so compare it with the live definition first.

alter table public.founder_context
  add column if not exists quiet_days date[] not null default '{}';

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
  v_quiet  date[];
  v_new    integer;
  v_missed integer;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'not allowed';
  end if;

  insert into founder_context (user_id) values (p_user_id) on conflict (user_id) do nothing;

  select coalesce(streak, 0), last_checkin_date::date, coalesce(quiet_days, '{}')
    into v_streak, v_last, v_quiet
    from founder_context where user_id = p_user_id for update;

  if v_last is not null and v_last = p_today then
    v_new := greatest(v_streak, 1);
  elsif v_last is not null and v_last < p_today then
    -- Days strictly between the last check-in and today that were NOT chosen as quiet days.
    select count(*) into v_missed
      from generate_series(v_last + 1, p_today - 1, interval '1 day') as d
     where not (d::date = any (v_quiet));
    if v_missed = 0 then
      v_new := v_streak + 1;
    else
      v_new := 1;
    end if;
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
