"""Feedback service."""

from sqlalchemy.orm import Session

from app.models import Feedback, Task, Milestone, Project


def create_feedback(db: Session, user_id: int, feedback_type: str, task_id: int | None = None) -> Feedback:
    if task_id is not None:
        task = (
            db.query(Task)
            .join(Milestone, Task.milestone_id == Milestone.id)
            .join(Project, Milestone.project_id == Project.id)
            .filter(Task.id == task_id, Project.user_id == user_id)
            .first()
        )
        if not task:
            raise ValueError("Task not found")

    row = Feedback(user_id=user_id, task_id=task_id, feedback_type=feedback_type)
    db.add(row)
    db.flush()
    return row


