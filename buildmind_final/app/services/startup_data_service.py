from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Project, StartupMetrics, ValidationData


def get_validation_data_for_project(db: Session, user_id: int, project_id: int) -> ValidationData | None:
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id).first()
    if not project:
        raise ValueError("Project not found")
    return db.query(ValidationData).filter(ValidationData.project_id == project_id).first()


def upsert_validation_data(
    db: Session,
    user_id: int,
    project_id: int,
    users_interviewed: int,
    interested_users: int,
    preorders: int,
    feedback_sentiment: str,
) -> ValidationData:
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id).first()
    if not project:
        raise ValueError("Project not found")

    row = db.query(ValidationData).filter(ValidationData.project_id == project_id).first()
    if row:
        row.users_interviewed = int(users_interviewed or 0)
        row.interested_users = int(interested_users or 0)
        row.preorders = int(preorders or 0)
        row.feedback_sentiment = str(feedback_sentiment or "neutral")
        db.add(row)
        db.flush()
        return row

    row = ValidationData(
        project_id=project_id,
        users_interviewed=int(users_interviewed or 0),
        interested_users=int(interested_users or 0),
        preorders=int(preorders or 0),
        feedback_sentiment=str(feedback_sentiment or "neutral"),
    )
    db.add(row)
    db.flush()
    return row


def get_startup_metrics_for_project(db: Session, user_id: int, project_id: int) -> StartupMetrics | None:
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id).first()
    if not project:
        raise ValueError("Project not found")
    return db.query(StartupMetrics).filter(StartupMetrics.project_id == project_id).first()


def upsert_startup_metrics(
    db: Session,
    user_id: int,
    project_id: int,
    milestones_completed: int,
    tasks_completed: int,
    early_users: int,
    active_users: int,
    execution_streak: int,
) -> StartupMetrics:
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id).first()
    if not project:
        raise ValueError("Project not found")

    row = db.query(StartupMetrics).filter(StartupMetrics.project_id == project_id).first()
    now = datetime.now(timezone.utc)
    if row:
        row.milestones_completed = int(milestones_completed or 0)
        row.tasks_completed = int(tasks_completed or 0)
        row.early_users = int(early_users or 0)
        row.active_users = int(active_users or 0)
        row.execution_streak = int(execution_streak or 0)
        row.updated_at = now
        db.add(row)
        db.flush()
        return row

    row = StartupMetrics(
        project_id=project_id,
        milestones_completed=int(milestones_completed or 0),
        tasks_completed=int(tasks_completed or 0),
        early_users=int(early_users or 0),
        active_users=int(active_users or 0),
        execution_streak=int(execution_streak or 0),
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return row
