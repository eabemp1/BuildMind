"""Rule-based roadmap generation service (v1, deterministic)."""

from backend.app.models import Milestone, Task


DEFAULT_WEEKLY_PLAN = [
    ("Research & Validation", [
        "Interview 5 target users",
        "Document top 3 pain points",
        "Define success criteria for MVP",
    ]),
    ("MVP Design", [
        "Create feature priority list",
        "Draft user flow for core feature",
        "Define MVP scope boundaries",
    ]),
    ("Build MVP", [
        "Implement core feature set",
        "Run internal smoke tests",
        "Fix blocking issues",
    ]),
    ("Launch & Feedback", [
        "Launch pilot to first users",
        "Collect structured feedback",
        "Define next sprint adjustments",
    ]),
]


def generate_weekly_plan(goal_duration_weeks: int) -> list[tuple[str, list[str]]]:
    weeks = max(1, int(goal_duration_weeks))
    out = []
    for week in range(weeks):
        title, tasks = DEFAULT_WEEKLY_PLAN[min(week, len(DEFAULT_WEEKLY_PLAN) - 1)]
        if week >= len(DEFAULT_WEEKLY_PLAN):
            title = f"Execution Week {week + 1}"
            tasks = [
                "Review last week outcomes",
                "Execute top 3 priority tasks",
                "Capture evidence and metrics",
            ]
        out.append((title, tasks))
    return out


def build_milestones_and_tasks(project_id: int, goal_duration_weeks: int) -> list[Milestone]:
    milestones: list[Milestone] = []
    for week_number, (title, task_descriptions) in enumerate(generate_weekly_plan(goal_duration_weeks), start=1):
        ms = Milestone(
            project_id=project_id,
            title=title,
            week_number=week_number,
            is_completed=False,
        )
        ms.tasks = [Task(description=desc, is_completed=False) for desc in task_descriptions]
        milestones.append(ms)
    return milestones


