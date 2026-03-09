"""BuildMind services for activity, notifications, newsletter, and admin analytics."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    ActivityLog,
    Feedback,
    Milestone,
    NewsletterSubscriber,
    Notification,
    NotificationPreference,
    Project,
    Task,
    User,
)


JOURNEY_STAGES = ["Idea", "Validation", "Prototype", "MVP", "First Users", "Revenue"]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _infer_project_stage(project: Project) -> str:
    if not project.milestones:
        return "Idea"
    completed = [m for m in project.milestones if m.is_completed or m.status == "completed"]
    index = min(len(completed), len(JOURNEY_STAGES) - 1)
    return JOURNEY_STAGES[index]


def create_activity(db: Session, user_id: int, activity_type: str, reference_id: int | None = None) -> ActivityLog:
    row = ActivityLog(user_id=user_id, activity_type=activity_type, reference_id=reference_id)
    db.add(row)
    db.flush()
    return row


def list_activities_for_user(db: Session, user_id: int, limit: int = 50) -> list[ActivityLog]:
    return (
        db.query(ActivityLog)
        .filter(ActivityLog.user_id == user_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )


def ensure_notification_preference(db: Session, user_id: int) -> NotificationPreference:
    pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == user_id).first()
    if pref:
        return pref
    pref = NotificationPreference(user_id=user_id)
    db.add(pref)
    db.flush()
    return pref


def update_notification_preference(
    db: Session,
    user_id: int,
    feedback_received: bool,
    milestone_completed: bool,
    task_assigned: bool,
) -> NotificationPreference:
    pref = ensure_notification_preference(db, user_id=user_id)
    pref.feedback_received = feedback_received
    pref.milestone_completed = milestone_completed
    pref.task_assigned = task_assigned
    pref.updated_at = _utcnow()
    db.add(pref)
    db.flush()
    return pref


def create_notification(
    db: Session,
    user_id: int,
    notification_type: str,
    message: str,
    reference_id: int | None = None,
) -> Notification:
    row = Notification(
        user_id=user_id,
        type=notification_type,
        message=message,
        reference_id=reference_id,
        is_read=False,
    )
    db.add(row)
    db.flush()
    return row


def list_notifications_for_user(db: Session, user_id: int, limit: int = 50) -> list[Notification]:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )


def mark_notification_as_read(db: Session, user_id: int, notification_id: int) -> Notification:
    row = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .first()
    )
    if not row:
        raise ValueError("Notification not found")
    row.is_read = True
    db.add(row)
    db.flush()
    return row


def subscribe_newsletter(db: Session, email: str) -> NewsletterSubscriber:
    lower = email.lower().strip()
    row = db.query(NewsletterSubscriber).filter(NewsletterSubscriber.email == lower).first()
    if row:
        row.subscribed = True
        db.add(row)
        db.flush()
        return row
    row = NewsletterSubscriber(email=lower, subscribed=True)
    db.add(row)
    db.flush()
    return row


def unsubscribe_newsletter(db: Session, email: str) -> NewsletterSubscriber:
    lower = email.lower().strip()
    row = db.query(NewsletterSubscriber).filter(NewsletterSubscriber.email == lower).first()
    if not row:
        row = NewsletterSubscriber(email=lower, subscribed=False)
    else:
        row.subscribed = False
    db.add(row)
    db.flush()
    return row


def build_buildmind_dashboard(db: Session, user_id: int) -> dict:
    projects = (
        db.query(Project)
        .filter(Project.user_id == user_id, Project.is_archived.is_(False))
        .order_by(Project.created_at.desc())
        .all()
    )
    project_ids = [p.id for p in projects]

    milestones = (
        db.query(Milestone)
        .filter(Milestone.project_id.in_(project_ids))
        .order_by(Milestone.order_index.asc(), Milestone.id.asc())
        .all()
        if project_ids
        else []
    )
    tasks = (
        db.query(Task)
        .join(Milestone, Task.milestone_id == Milestone.id)
        .filter(Milestone.project_id.in_(project_ids))
        .all()
        if project_ids
        else []
    )

    completed_tasks = [t for t in tasks if t.is_completed or t.status == "completed"]
    execution_score = round((len(completed_tasks) / max(1, len(tasks))) * 100, 2)

    today = datetime.now(timezone.utc).date()
    streak = 0
    for offset in range(0, 30):
        date_to_check = today - timedelta(days=offset)
        day_completed = any(
            (task.completed_at and task.completed_at.date() == date_to_check)
            for task in completed_tasks
        )
        if day_completed:
            streak += 1
        elif offset > 0:
            break

    completed_milestones = [m for m in milestones if m.is_completed or m.status == "completed"]
    journey_progress = round((len(completed_milestones) / max(1, len(milestones))) * 100, 2)

    weekly_cutoff = _utcnow() - timedelta(days=7)
    weekly_completed = sum(1 for task in completed_tasks if task.completed_at and task.completed_at >= weekly_cutoff)

    notifications = list_notifications_for_user(db, user_id=user_id, limit=10)
    activities = list_activities_for_user(db, user_id=user_id, limit=10)
    next_actions = [
        {
            "task_id": task.id,
            "title": task.title or task.description[:80],
            "priority": task.priority,
            "due_date": task.due_date,
        }
        for task in tasks
        if not (task.is_completed or task.status == "completed")
    ][:10]

    return {
        "execution_score": execution_score,
        "execution_streak": streak,
        "journey_progress": journey_progress,
        "active_projects": [
            {
                "id": project.id,
                "title": project.title,
                "progress": project.progress,
                "stage": _infer_project_stage(project),
            }
            for project in projects
        ],
        "recent_activity": activities,
        "notifications": notifications,
        "next_actions": next_actions,
        "weekly_progress": {
            "tasks_completed": weekly_completed,
            "milestones_completed": len([m for m in completed_milestones if m.completed_at and m.completed_at >= weekly_cutoff]),
        },
    }


def _series_for_count_per_day(db: Session, model, date_field: str, days: int = 30) -> list[dict]:
    field = getattr(model, date_field)
    rows = (
        db.query(func.date(field).label("day"), func.count(model.id))
        .group_by(func.date(field))
        .order_by(func.date(field).asc())
        .all()
    )
    out = []
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=days)
    for day, count in rows:
        if day and day >= cutoff:
            out.append({"date": str(day), "count": int(count)})
    return out


def build_admin_platform_analytics(db: Session) -> dict:
    today = datetime.now(timezone.utc).date()
    start_of_day = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
    daily_active_users = (
        db.query(func.count(func.distinct(ActivityLog.user_id)))
        .filter(ActivityLog.created_at >= start_of_day)
        .scalar()
        or 0
    )
    task_totals = db.query(func.count(Task.id)).scalar() or 0
    task_completed = db.query(func.count(Task.id)).filter(Task.is_completed.is_(True)).scalar() or 0

    return {
        "total_users": db.query(func.count(User.id)).scalar() or 0,
        "total_projects": db.query(func.count(Project.id)).scalar() or 0,
        "total_milestones": db.query(func.count(Milestone.id)).scalar() or 0,
        "total_tasks": task_totals,
        "daily_active_users": int(daily_active_users),
        "user_growth": _series_for_count_per_day(db, User, "created_at"),
        "project_creation_trends": _series_for_count_per_day(db, Project, "created_at"),
        "task_completion_rates": [
            {
                "label": "completed",
                "rate": round((task_completed / max(1, task_totals)) * 100, 2),
            }
        ],
    }


def list_admin_users(db: Session, query: str | None = None) -> list[User]:
    q = db.query(User)
    if query:
        like = f"%{query.strip()}%"
        q = q.filter((User.email.ilike(like)) | (User.username.ilike(like)))
    return q.order_by(User.created_at.desc()).all()


def set_user_active_status(db: Session, user_id: int, is_active: bool) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")
    user.is_active = is_active
    db.add(user)
    db.flush()
    return user


def delete_user_account(db: Session, user_id: int) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")
    db.delete(user)
    db.flush()


def list_admin_projects(db: Session, stage: str | None = None) -> list[dict]:
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    out = []
    for project in projects:
        inferred = _infer_project_stage(project)
        if stage and inferred.lower() != stage.lower():
            continue
        out.append(
            {
                "id": project.id,
                "user_id": project.user_id,
                "title": project.title,
                "progress": project.progress,
                "stage": inferred,
                "is_archived": project.is_archived,
                "created_at": project.created_at,
            }
        )
    return out


def list_all_feedback(db: Session) -> list[Feedback]:
    return db.query(Feedback).order_by(Feedback.created_at.desc()).all()


def list_newsletter_subscribers(db: Session) -> list[NewsletterSubscriber]:
    return db.query(NewsletterSubscriber).order_by(NewsletterSubscriber.created_at.desc()).all()
