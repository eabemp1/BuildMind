-- One-time cleanup for data written before the Today data-integrity fixes.
-- Run in the Supabase SQL editor. Each block has a PREVIEW (select) and an APPLY (update).
-- Nothing here is run automatically. Review the preview counts first.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Archetype prediction rows wrongly flipped to "ignored".
--    The old 24h sweep marked every pending row "ignored", including
--    prediction_source = 'founder_intelligence' rows that are only resolved by a
--    reflection with evidence. The bandit counted those as failures
--    ("0 of 8 resolved"). Rows with no evidence score and no note were never
--    resolved by the founder, so put them back to pending.
-- ─────────────────────────────────────────────────────────────────────────────
-- PREVIEW
select candidate_id, count(*) as wrongly_ignored
from reflexion_learning_log
where prediction_source = 'founder_intelligence'
  and outcome = 'ignored'
  and evidence_match_score is null
  and outcome_note is null
group by candidate_id
order by 2 desc;

-- APPLY
update reflexion_learning_log
set outcome = 'pending',
    outcome_recorded_at = null
where prediction_source = 'founder_intelligence'
  and outcome = 'ignored'
  and evidence_match_score is null
  and outcome_note is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Reflection text stored as an avoidance zone / topic.
--    Removes entries that are quotes (contain "Tried:", "Learned:", "|" ...) or
--    longer than 60 characters, from both tables that hold them.
-- ─────────────────────────────────────────────────────────────────────────────
-- PREVIEW
select 'founder_context' as tbl, user_id, avoidance_zones, topics_mentioned_repeatedly
from founder_context
where exists (select 1 from unnest(coalesce(avoidance_zones, '{}')) z
              where length(z) > 60 or z ~* '(tried|learned|result|happened|note|blocker)\s*:' or z like '%|%')
   or exists (select 1 from unnest(coalesce(topics_mentioned_repeatedly, '{}')) z
              where length(z) > 60 or z ~* '(tried|learned|result|happened|note|blocker)\s*:' or z like '%|%')
union all
select 'founder_memory', user_id, avoidance_zones, null
from founder_memory
where exists (select 1 from unnest(coalesce(avoidance_zones, '{}')) z
              where length(z) > 60 or z ~* '(tried|learned|result|happened|note|blocker)\s*:' or z like '%|%');

-- APPLY
update founder_context
set avoidance_zones = array(
      select z from unnest(coalesce(avoidance_zones, '{}')) z
      where length(z) <= 60 and z !~* '(tried|learned|result|happened|note|blocker)\s*:' and z not like '%|%'),
    topics_mentioned_repeatedly = array(
      select z from unnest(coalesce(topics_mentioned_repeatedly, '{}')) z
      where length(z) <= 60 and z !~* '(tried|learned|result|happened|note|blocker)\s*:' and z not like '%|%');

update founder_memory
set avoidance_zones = array(
      select z from unnest(coalesce(avoidance_zones, '{}')) z
      where length(z) <= 60 and z !~* '(tried|learned|result|happened|note|blocker)\s*:' and z not like '%|%');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Reflections saved against a stale task (read-only check; no automatic fix).
--    A task text that repeats on 3+ reflections is almost certainly the stale
--    snapshot bug, not 3 real repeats.
-- ─────────────────────────────────────────────────────────────────────────────
select user_id, left(today_action, 100) as task, count(*) as reflections, min(created_at)::date as first, max(created_at)::date as last
from reflections
where today_action is not null
group by user_id, left(today_action, 100)
having count(*) >= 3
order by reflections desc;
