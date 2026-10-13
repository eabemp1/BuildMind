-- BuildMind: momentum + RPC health. Run each block separately in the Supabase SQL editor.

-- 1) Do the RPCs the app calls exist in the live database? (6 of them have NO definition
--    anywhere in the repo.) Every row should say 'present'.
select n.name,
       case when exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                         where s.nspname = 'public' and p.proname = n.name) then 'present' else 'MISSING' end as status
from (values ('update_momentum_atomic'),('complete_task_atomic'),('bump_momentum_atomic'),
             ('grant_xp_atomic'),('update_streak_atomic'),('upsert_pulse_score'),
             ('get_pulse_streak'),('bm_ai_usage_spend')) as n(name);

-- 2) Dump the live momentum math so it can be checked against lib/momentum.ts
--    (EMA alpha 0.25, floor 20, cap 100, gap compounding up to 14 days).
--    Paste the output back and I will diff it against the TypeScript.
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public'
  and p.proname in ('update_momentum_atomic','complete_task_atomic','bump_momentum_atomic');

-- 3) Which momentum number does each surface read, and do they agree?
--    founder_context is the source of truth; projects.momentum_score is only a mirror.
select fc.user_id,
       fc.momentum_score        as founder_context_momentum,
       fc.momentum_last_week    as weekly_baseline,
       fc.momentum_score - fc.momentum_last_week as delta_shown_in_app,
       p.momentum_score         as project_mirror,
       fc.momentum_score - p.momentum_score      as mirror_drift,
       fc.days_inactive, fc.momentum_updated_at
from founder_context fc
left join lateral (select momentum_score from projects where user_id = fc.user_id order by updated_at desc limit 1) p on true
order by abs(coalesce(fc.momentum_score - p.momentum_score, 0)) desc
limit 50;

-- 4) How many founders have NO weekly baseline (their "vs last week" is blank or stale)?
select count(*) filter (where momentum_last_week is null) as no_baseline,
       count(*) filter (where momentum_last_week is not null) as has_baseline,
       count(*) as total
from founder_context;

-- 5) Did the Supabase edge-function jobs and the Vercel crons both run? (double decay check)
--    Two 'evening_check' rows for one user on one day = double decay.
select user_id, date_trunc('day', created_at) as day, count(*) as runs
from evening_checks
where created_at >= now() - interval '14 days'
group by 1, 2 having count(*) > 1
order by day desc limit 50;
