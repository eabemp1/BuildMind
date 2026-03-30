from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Milestone, Project, Task, User, WeeklyReport
from app.services.ai_service import generate_ai_response


def _start_of_week(dt: datetime) -> datetime:
    # Week starts Monday
    start = dt - timedelta(days=dt.weekday())
    return start.replace(hour=0, minute=0, second=0, microsecond=0)


def generate_founder_report(db: Session, user_id: int) -> WeeklyReport:
    now = datetime.now(timezone.utc)
    week_start = _start_of_week(now)
    week_end = week_start + timedelta(days=7)

    projects_count = db.query(func.count(Project.id)).filter(Project.user_id == user_id).scalar() or 0

    milestones_completed = (
        db.query(func.count(Milestone.id))
        .join(Project, Milestone.project_id == Project.id)
        .filter(
            Project.user_id == user_id,
            Milestone.is_completed.is_(True),
            Milestone.completed_at.is_not(None),
            Milestone.completed_at >= week_start,
            Milestone.completed_at < week_end,
        )
        .scalar()
        or 0
    )

    tasks_completed = (
        db.query(func.count(Task.id))
        .join(Milestone, Task.milestone_id == Milestone.id)
        .join(Project, Milestone.project_id == Project.id)
        .filter(
            Project.user_id == user_id,
            Task.is_completed.is_(True),
            Task.completed_at.is_not(None),
            Task.completed_at >= week_start,
            Task.completed_at < week_end,
        )
        .scalar()
        or 0
    )

    prompt = (
        "You are a startup advisor.\n\n"
        "Analyze this founder's weekly progress and provide:\n"
        "1) Strength\n"
        "2) Risk\n"
        "3) Suggested next step\n\n"
        f"Data:\nProjects: {projects_count}\n"
        f"Milestones completed: {milestones_completed}\n"
        f"Tasks completed: {tasks_completed}\n\n"
        "Respond with:\nSummary\nRisk\nNext Step"
    )

    ai_text = generate_ai_response(
        messages=[
            {"role": "system", "content": "Return concise weekly insight sections."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
    )

    summary = ""
    risk = ""
    next_step = ""
    for line in ai_text.splitlines():
        clean = line.strip()
        if clean.lower().startswith("summary"):
            summary = clean.split(":", 1)[-1].strip()
        elif clean.lower().startswith("risk"):
            risk = clean.split(":", 1)[-1].strip()
        elif clean.lower().startswith("next"):
            next_step = clean.split(":", 1)[-1].strip()

    report = WeeklyReport(
        user_id=user_id,
        week_start_date=week_start,
        projects_count=int(projects_count),
        milestones_completed=int(milestones_completed),
        tasks_completed=int(tasks_completed),
        ai_summary=summary or ai_text,
        ai_risks=risk or None,
        ai_suggestions=next_step or None,
        created_at=now,
    )
    db.add(report)
    db.flush()
    return report


def generate_weekly_reports_for_all_users(db: Session) -> int:
    users = db.query(User.id).filter(User.is_active.is_(True)).all()
    count = 0
    for row in users:
        generate_founder_report(db, user_id=row.id)
        count += 1
    return count


def get_latest_weekly_report(db: Session, user_id: int) -> WeeklyReport | None:
    return (
        db.query(WeeklyReport)
        .filter(WeeklyReport.user_id == user_id)
        .order_by(WeeklyReport.created_at.desc())
        .first()
    )
