-- Read-only. Milestones marked completed that still have genuinely open tasks.
-- Most come from "I'm already past this stage": the roadmap seeder marks the previous phase complete without
-- completing its tasks. That is a deliberate stage choice, not corruption, so this is a list to review, not auto-fixed.
select m.id as milestone_id, m.title, m.project_id, count(t.*) filter (where not coalesce(t.is_completed,false)) as open_tasks, count(t.*) as total_tasks
from milestones m join tasks t on t.milestone_id = m.id
where m.status = 'completed'
group by m.id, m.title, m.project_id
having count(t.*) filter (where not coalesce(t.is_completed,false)) > 0
order by open_tasks desc;
