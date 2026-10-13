-- Run in the Supabase SQL editor.
-- The Vercel crons (vercel.json) own morning briefing, evening check, weekly report,
-- Sunday email and daily push. These pg_cron jobs from cron-schedule.sql duplicate them
-- (and used different rules), so unschedule them. Safe to re-run.

-- 1) See what is scheduled right now
select jobid, jobname, schedule, active from cron.job order by jobname;

-- 2) Remove the duplicates
do $$
declare j text;
begin
  foreach j in array array['morning-briefing','evening-check','weekly-mirror','daily-push'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

-- 3) Confirm: should list only jobs you deliberately kept
select jobid, jobname, schedule, active from cron.job order by jobname;
