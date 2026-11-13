-- Check completion counters against check-ins (read-only first).
-- Before 13 Nov 2026 a blocked or skipped check-in could raise founder_context.tasks_completed_total.
-- Step 1: run this SELECT. It lists founders whose counter is higher than their completed/partial/learned check-ins.
-- It only compares against reflections, so a founder who completed tasks some other way will also show up.
-- Read the rows before running Step 2.

SELECT fc.user_id,
       fc.tasks_completed_total                                            AS counter,
       count(r.*) FILTER (WHERE coalesce(r.outcome, 'completed') NOT IN ('blocked','skipped','abandoned')) AS real_checkins,
       count(r.*) FILTER (WHERE r.outcome IN ('blocked','skipped','abandoned'))                           AS not_done_checkins
FROM founder_context fc
LEFT JOIN reflections r ON r.user_id = fc.user_id
GROUP BY fc.user_id, fc.tasks_completed_total
HAVING fc.tasks_completed_total > count(r.*) FILTER (WHERE coalesce(r.outcome, 'completed') NOT IN ('blocked','skipped','abandoned'))
ORDER BY fc.tasks_completed_total DESC;

-- Step 2 (only after reading Step 1). Lowers the counter to the number of real check-ins, never raises it.
-- Uncomment to run. Take a copy of the table first:  CREATE TABLE founder_context_backup_20261113 AS SELECT * FROM founder_context;
--
-- UPDATE founder_context fc
-- SET tasks_completed_total = x.real_checkins
-- FROM (
--   SELECT user_id, count(*) FILTER (WHERE coalesce(outcome, 'completed') NOT IN ('blocked','skipped','abandoned')) AS real_checkins
--   FROM reflections GROUP BY user_id
-- ) x
-- WHERE x.user_id = fc.user_id
--   AND fc.tasks_completed_total > x.real_checkins;
