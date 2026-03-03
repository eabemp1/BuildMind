"""Task completion and milestone status propagation."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.app.models import Task, Milestone, Project


def complete_task_for_user(db: Session, user_id: int, task_id: int) -> Task:
    task = (
        db.query(Task)
        .join(Milestone, Task.milestone_id == Milestone.id)
        .join(Project, Milestone.project_id == Project.id)
        .filter(Task.id == task_id, Project.user_id == user_id)
        .first()
    )
    if not task:
        raise ValueError("Task not found")

    if not task.is_completed:
        task.is_completed = True
        task.completed_at = datetime.now(timezone.utc)
        db.add(task)
        db.flush()

    milestone = db.query(Milestone).filter(Milestone.id == task.milestone_id).first()
    if milestone:
        all_done = all(t.is_completed for t in milestone.tasks)
        milestone.is_completed = bool(all_done)
        db.add(milestone)
        db.flush()

    return task

