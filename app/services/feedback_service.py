"""Feedback service."""

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Feedback, Task, Milestone, Project
from app.services.buildmind_service import create_activity, create_notification


def create_feedback(
    db: Session,
    user_id: int,
    feedback_type: str | None = None,
    task_id: int | None = None,
    project_id: int | None = None,
    rating: int | None = None,
    category: str | None = None,
    comment: str | None = None,
) -> Feedback:
    project_owner_id: int | None = None
    if project_id is not None:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ValueError("Project not found")
        project_owner_id = project.user_id

    if task_id is not None:
        task = (
            db.query(Task)
            .join(Milestone, Task.milestone_id == Milestone.id)
            .join(Project, Milestone.project_id == Project.id)
            .filter(Task.id == task_id)
            .first()
        )
        if not task:
            raise ValueError("Task not found")
        if project_id is None:
            project_id = task.milestone.project_id
            project_owner_id = task.milestone.project.user_id

    row = Feedback(
        user_id=user_id,
        project_id=project_id,
        task_id=task_id,
        feedback_type=feedback_type,
        rating=rating,
        category=category,
        comment=comment,
    )
    db.add(row)
    db.flush()
    create_activity(db, user_id=user_id, activity_type="feedback_posted", reference_id=row.id)
    if project_owner_id and project_owner_id != user_id:
        create_notification(
            db,
            user_id=project_owner_id,
            notification_type="feedback_received",
            message="Your project received new feedback.",
            reference_id=row.id,
        )
    return row


def list_feedback_for_project(db: Session, user_id: int, project_id: int) -> list[Feedback]:
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id).first()
    if not project:
        raise ValueError("Project not found")
    return db.query(Feedback).filter(Feedback.project_id == project_id).order_by(Feedback.created_at.desc()).all()


def get_feedback_gate_status(db: Session, user_id: int) -> dict:
    distinct_projects = (
        db.query(func.count(func.distinct(Feedback.project_id)))
        .join(Project, Feedback.project_id == Project.id)
        .filter(
            Feedback.user_id == user_id,
            Feedback.project_id.isnot(None),
            Project.user_id != user_id,
        )
        .scalar()
        or 0
    )
    required = 2
    unlocked = int(distinct_projects) >= required
    message = (
        "Feedback requests unlocked."
        if unlocked
        else "Give feedback on 2 projects to unlock feedback requests."
    )
    return {
        "feedback_given": int(distinct_projects),
        "required": required,
        "unlocked": unlocked,
        "message": message,
    }


def request_feedback_for_own_project(db: Session, user_id: int, project_id: int) -> dict:
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id).first()
    if not project:
        raise ValueError("Project not found")

    gate = get_feedback_gate_status(db, user_id=user_id)
    if not gate["unlocked"]:
        raise PermissionError("Give feedback on 2 projects to unlock feedback requests.")

    create_activity(db, user_id=user_id, activity_type="feedback_request_created", reference_id=project_id)
    create_notification(
        db,
        user_id=user_id,
        notification_type="feedback_request_sent",
        message=f"Feedback request submitted for '{project.title}'.",
        reference_id=project_id,
    )
    return {
        "project_id": project.id,
        "requested": True,
        "message": "Feedback request submitted successfully.",
    }


