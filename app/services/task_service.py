"""Task completion and milestone status propagation."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Task, Milestone, Project
from app.services.buildmind_service import create_activity, create_notification


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
        task.status = "completed"
        task.completed_at = datetime.now(timezone.utc)
        db.add(task)
        db.flush()
        create_activity(db, user_id=user_id, activity_type="task_completed", reference_id=task.id)

    milestone = db.query(Milestone).filter(Milestone.id == task.milestone_id).first()
    if milestone:
        all_done = all(t.is_completed for t in milestone.tasks)
        milestone.is_completed = bool(all_done)
        milestone.status = "completed" if all_done else "in_progress"
        milestone.completed_at = datetime.now(timezone.utc) if all_done else None
        db.add(milestone)
        db.flush()
        if all_done:
            create_activity(db, user_id=user_id, activity_type="milestone_completed", reference_id=milestone.id)
            create_notification(
                db,
                user_id=user_id,
                notification_type="milestone_completed",
                message=f"Milestone '{milestone.title}' completed.",
                reference_id=milestone.id,
            )
    _update_project_progress(db, milestone.project_id if milestone else None)

    return task


def _update_project_progress(db: Session, project_id: int | None) -> None:
    if not project_id:
        return
    milestones = db.query(Milestone).filter(Milestone.project_id == project_id).all()
    if not milestones:
        return
    completed = [m for m in milestones if m.is_completed or m.status == "completed"]
    progress = (len(completed) / len(milestones)) * 100
    project = db.query(Project).filter(Project.id == project_id).first()
    if project:
        project.progress = round(progress, 2)
        db.add(project)
        db.flush()


def create_task_for_user(
    db: Session,
    user_id: int,
    milestone_id: int,
    title: str,
    description: str,
    status: str = "todo",
    priority: str = "medium",
    due_date: datetime | None = None,
) -> Task:
    milestone = (
        db.query(Milestone)
        .join(Project, Milestone.project_id == Project.id)
        .filter(Milestone.id == milestone_id, Project.user_id == user_id)
        .first()
    )
    if not milestone:
        raise ValueError("Milestone not found")
    task = Task(
        milestone_id=milestone_id,
        title=title,
        description=description,
        status=status,
        priority=priority,
        due_date=due_date,
        is_completed=(status == "completed"),
        completed_at=datetime.now(timezone.utc) if status == "completed" else None,
    )
    db.add(task)
    db.flush()
    create_notification(
        db,
        user_id=user_id,
        notification_type="task_assigned",
        message=f"New task assigned: {title}",
        reference_id=task.id,
    )
    return task


def update_task_for_user(
    db: Session,
    user_id: int,
    task_id: int,
    title: str | None = None,
    description: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    due_date: datetime | None = None,
) -> Task:
    task = (
        db.query(Task)
        .join(Milestone, Task.milestone_id == Milestone.id)
        .join(Project, Milestone.project_id == Project.id)
        .filter(Task.id == task_id, Project.user_id == user_id)
        .first()
    )
    if not task:
        raise ValueError("Task not found")

    if title is not None:
        task.title = title
    if description is not None:
        task.description = description
    if status is not None:
        task.status = status
        is_done = status == "completed"
        task.is_completed = is_done
        task.completed_at = datetime.now(timezone.utc) if is_done else None
    if priority is not None:
        task.priority = priority
    if due_date is not None:
        task.due_date = due_date

    db.add(task)
    db.flush()
    return task


def delete_task_for_user(db: Session, user_id: int, task_id: int) -> None:
    task = (
        db.query(Task)
        .join(Milestone, Task.milestone_id == Milestone.id)
        .join(Project, Milestone.project_id == Project.id)
        .filter(Task.id == task_id, Project.user_id == user_id)
        .first()
    )
    if not task:
        raise ValueError("Task not found")
    project_id = task.milestone.project_id
    db.delete(task)
    db.flush()
    _update_project_progress(db, project_id)


def update_milestone_for_user(
    db: Session,
    user_id: int,
    milestone_id: int,
    title: str | None = None,
    status: str | None = None,
    order_index: int | None = None,
) -> Milestone:
    milestone = (
        db.query(Milestone)
        .join(Project, Milestone.project_id == Project.id)
        .filter(Milestone.id == milestone_id, Project.user_id == user_id)
        .first()
    )
    if not milestone:
        raise ValueError("Milestone not found")
    if title is not None:
        milestone.title = title
    if order_index is not None:
        milestone.order_index = order_index
        milestone.week_number = order_index + 1
    if status is not None:
        milestone.status = status
        done = status == "completed"
        milestone.is_completed = done
        milestone.completed_at = datetime.now(timezone.utc) if done else None
    db.add(milestone)
    db.flush()
    _update_project_progress(db, milestone.project_id)
    return milestone


def reorder_milestones_for_user(db: Session, user_id: int, project_id: int, items: list[dict]) -> list[Milestone]:
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id).first()
    if not project:
        raise ValueError("Project not found")
    ids = [item["milestone_id"] for item in items]
    milestones = (
        db.query(Milestone)
        .filter(Milestone.project_id == project_id, Milestone.id.in_(ids))
        .all()
    )
    by_id = {m.id: m for m in milestones}
    for item in items:
        milestone = by_id.get(item["milestone_id"])
        if not milestone:
            continue
        milestone.order_index = int(item["order_index"])
        milestone.week_number = int(item["order_index"]) + 1
        db.add(milestone)
    db.flush()
    return (
        db.query(Milestone)
        .filter(Milestone.project_id == project_id)
        .order_by(Milestone.order_index.asc(), Milestone.id.asc())
        .all()
    )


