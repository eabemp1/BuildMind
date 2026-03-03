"""Execution score calculation and history persistence."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Task, Milestone, Feedback, ExecutionScoreHistory, Project


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _safe_ratio(num: int, den: int) -> float:
    return _clamp01(float(num) / float(max(1, den)))


def calculate_score_components(db: Session, user_id: int) -> dict:
    task_total = (
        db.query(func.count(Task.id))
        .join(Milestone, Task.milestone_id == Milestone.id)
        .join(Project, Milestone.project_id == Project.id)
        .filter(Project.user_id == user_id)
        .scalar()
        or 0
    )
    task_completed = (
        db.query(func.count(Task.id))
        .join(Milestone, Task.milestone_id == Milestone.id)
        .join(Project, Milestone.project_id == Project.id)
        .filter(Project.user_id == user_id, Task.is_completed.is_(True))
        .scalar()
        or 0
    )
    task_completion_rate = _safe_ratio(int(task_completed), int(task_total))

    milestone_total = (
        db.query(func.count(Milestone.id))
        .join(Project, Milestone.project_id == Project.id)
        .filter(Project.user_id == user_id)
        .scalar()
        or 0
    )
    milestone_completed = (
        db.query(func.count(Milestone.id))
        .join(Project, Milestone.project_id == Project.id)
        .filter(Project.user_id == user_id, Milestone.is_completed.is_(True))
        .scalar()
        or 0
    )
    milestone_completion_rate = _safe_ratio(int(milestone_completed), int(milestone_total))

    four_weeks_ago = datetime.now(timezone.utc) - timedelta(days=28)
    rows = (
        db.query(Task.completed_at)
        .join(Milestone, Task.milestone_id == Milestone.id)
        .join(Project, Milestone.project_id == Project.id)
        .filter(
            Project.user_id == user_id,
            Task.is_completed.is_(True),
            Task.completed_at.is_not(None),
            Task.completed_at >= four_weeks_ago,
        )
        .all()
    )
    active_weeks = {
        f"{row.completed_at.isocalendar().year}-W{row.completed_at.isocalendar().week}"
        for row in rows
        if row.completed_at
    }
    weekly_consistency = _safe_ratio(len(active_weeks), 4)

    pos = db.query(func.count(Feedback.id)).filter(Feedback.user_id == user_id, Feedback.feedback_type == "positive").scalar() or 0
    neg = db.query(func.count(Feedback.id)).filter(Feedback.user_id == user_id, Feedback.feedback_type == "negative").scalar() or 0
    feedback_positivity_ratio = _safe_ratio(int(pos), int(pos + neg))

    return {
        "task_completion_rate": task_completion_rate,
        "weekly_consistency": weekly_consistency,
        "milestone_completion_rate": milestone_completion_rate,
        "feedback_positivity_ratio": feedback_positivity_ratio,
    }


def calculate_execution_score(components: dict) -> float:
    score = (
        0.4 * float(components["task_completion_rate"])
        + 0.3 * float(components["weekly_consistency"])
        + 0.2 * float(components["milestone_completion_rate"])
        + 0.1 * float(components["feedback_positivity_ratio"])
    )
    return round(_clamp01(score) * 100.0, 2)


def store_weekly_score(db: Session, user_id: int, score: float) -> ExecutionScoreHistory:
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

    existing = (
        db.query(ExecutionScoreHistory)
        .filter(
            ExecutionScoreHistory.user_id == user_id,
            ExecutionScoreHistory.calculated_at >= week_start,
        )
        .order_by(ExecutionScoreHistory.calculated_at.desc())
        .first()
    )
    if existing:
        existing.score = score
        existing.calculated_at = now
        db.add(existing)
        db.flush()
        return existing

    row = ExecutionScoreHistory(user_id=user_id, score=score, calculated_at=now)
    db.add(row)
    db.flush()
    return row


