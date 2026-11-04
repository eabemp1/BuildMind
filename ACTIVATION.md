# Activation and the numbers to watch

**Activation event:** a founder finishes their first stress test (`break_run_completed`) and completes their first daily task (`first_task_completed`).
Both are written to `funnel_events` by the existing funnel code. Nothing else counts as activation.

Run these in the Supabase SQL editor. They only read.

```sql
-- 1. People who signed up, and how many activated (last 30 days)
with s as (select distinct user_id from funnel_events where step = 'signup' and created_at > now() - interval '30 days' and user_id is not null),
     b as (select distinct user_id from funnel_events where step = 'break_run_completed' and user_id is not null),
     t as (select distinct user_id from funnel_events where step = 'first_task_completed' and user_id is not null)
select (select count(*) from s) as signups,
       (select count(*) from s join b using (user_id)) as finished_a_stress_test,
       (select count(*) from s join b using (user_id) join t using (user_id)) as activated;

-- 2. Came back in week 2 (an action logged 7 to 14 days after signup)
select count(distinct a.user_id) as returned_week_2
from action_logs a
join (select user_id, min(created_at) as signed_up from funnel_events where step = 'signup' and user_id is not null group by user_id) f using (user_id)
where a.created_at between f.signed_up + interval '7 days' and f.signed_up + interval '14 days';

-- 3. Paying now
select count(*) as paying from subscriptions where plan = 'builder' and lower(status) in ('active','grace');
```

Read them once a week. At small numbers they show direction, not proof.

## AI cost per feature
Every AI call writes one `[ai-cost]` line to the Vercel logs: feature, provider, time taken and an estimated token count (characters divided by 4). Gemini calls also write its exact token counts, including thinking tokens. Filter the logs for `[ai-cost]` to see which feature costs what. Estimates are marked `"estimate":true`.
