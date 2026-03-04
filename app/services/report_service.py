from datetime import datetime, timedelta, timezone, date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.execution.scoring import calculate_execution_score, calculate_score_components
from app.models import ExecutionScoreHistory, Feedback, Milestone, Project, Task


def _start_of_day(dt: datetime) -> datetime:
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def build_weekly_report(db: Session, user_id: int) -> dict:
    now = datetime.now(timezone.utc)
    start_dt = _start_of_day(now - timedelta(days=6))
    end_dt = now

    days: list[date] = [(start_dt + timedelta(days=i)).date() for i in range(7)]
    day_keys = [d.isoformat() for d in days]

    task_total = (
        db.query(func.count(Task.id))
        .join(Milestone, Task.milestone_id == Milestone.id)
        .join(Project, Milestone.project_id == Project.id)
        .filter(Project.user_id == user_id)
        .scalar()
        or 0
    )
    task_total = max(1, int(task_total))

    task_rows = (
        db.query(Task.completed_at)
        .join(Milestone, Task.milestone_id == Milestone.id)
        .join(Project, Milestone.project_id == Project.id)
        .filter(
            Project.user_id == user_id,
            Task.is_completed.is_(True),
            Task.completed_at.is_not(None),
            Task.completed_at >= start_dt,
            Task.completed_at <= end_dt,
        )
        .all()
    )
    tasks_by_day = {key: 0 for key in day_keys}
    for row in task_rows:
        if not row.completed_at:
            continue
        key = row.completed_at.date().isoformat()
        if key in tasks_by_day:
            tasks_by_day[key] += 1

    weekly_task_completion = [
        {
            "date": day,
            "completion_rate": round(float(tasks_by_day[day.isoformat()]) / float(task_total), 4),
            "tasks_completed": int(tasks_by_day[day.isoformat()]),
        }
        for day in days
    ]

    milestone_rows = (
        db.query(Milestone.id, func.max(Task.completed_at).label("achieved_at"))
        .join(Project, Milestone.project_id == Project.id)
        .join(Task, Task.milestone_id == Milestone.id)
        .filter(
            Project.user_id == user_id,
            Milestone.is_completed.is_(True),
            Task.completed_at.is_not(None),
            Task.completed_at >= start_dt,
            Task.completed_at <= end_dt,
        )
        .group_by(Milestone.id)
        .all()
    )
    milestones_by_day = {key: 0 for key in day_keys}
    for row in milestone_rows:
        achieved_at = row.achieved_at
        if not achieved_at:
            continue
        key = achieved_at.date().isoformat()
        if key in milestones_by_day:
            milestones_by_day[key] += 1

    milestone_achievement = [
        {"date": day, "count": int(milestones_by_day[day.isoformat()])}
        for day in days
    ]

    score_rows = (
        db.query(ExecutionScoreHistory.calculated_at, ExecutionScoreHistory.score)
        .filter(
            ExecutionScoreHistory.user_id == user_id,
            ExecutionScoreHistory.calculated_at >= start_dt,
            ExecutionScoreHistory.calculated_at <= end_dt,
        )
        .order_by(ExecutionScoreHistory.calculated_at.asc())
        .all()
    )
    score_map: dict[str, list[float]] = {key: [] for key in day_keys}
    for row in score_rows:
        key = row.calculated_at.date().isoformat()
        if key in score_map:
            score_map[key].append(float(row.score))

    execution_score_trend = []
    fallback_today_score = calculate_execution_score(calculate_score_components(db, user_id=user_id))
    for day in days:
        key = day.isoformat()
        values = score_map[key]
        if values:
            score = round(sum(values) / len(values), 2)
        elif key == now.date().isoformat():
            score = float(fallback_today_score)
        else:
            score = 0.0
        execution_score_trend.append({"date": day, "score": score})

    pos = (
        db.query(func.count(Feedback.id))
        .filter(
            Feedback.user_id == user_id,
            Feedback.feedback_type == "positive",
            Feedback.created_at >= start_dt,
            Feedback.created_at <= end_dt,
        )
        .scalar()
        or 0
    )
    neg = (
        db.query(func.count(Feedback.id))
        .filter(
            Feedback.user_id == user_id,
            Feedback.feedback_type == "negative",
            Feedback.created_at >= start_dt,
            Feedback.created_at <= end_dt,
        )
        .scalar()
        or 0
    )
    pos = int(pos)
    neg = int(neg)
    ratio = round(float(pos) / float(max(1, pos + neg)), 4)

    return {
        "start_date": start_dt.date(),
        "end_date": end_dt.date(),
        "execution_score_trend": execution_score_trend,
        "weekly_task_completion": weekly_task_completion,
        "milestone_achievement": milestone_achievement,
        "tasks_completed_this_week": int(sum(tasks_by_day.values())),
        "feedback": {
            "positive": pos,
            "negative": neg,
            "positive_ratio": ratio,
        },
    }
