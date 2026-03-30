from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone

from app.execution.scoring import calculate_execution_score, calculate_score_components, store_weekly_score
from app.models import ExecutionScoreHistory, Task, Milestone, Project


def get_scoring_summary(db: Session, user_id: int, history_limit: int = 12) -> dict:
    components = calculate_score_components(db, user_id=user_id)
    score = calculate_execution_score(components)
    store_weekly_score(db, user_id=user_id, score=score)

    history = (
        db.query(ExecutionScoreHistory)
        .filter(ExecutionScoreHistory.user_id == user_id)
        .order_by(ExecutionScoreHistory.calculated_at.desc())
        .limit(history_limit)
        .all()
    )

    return {
        "execution_score": float(score),
        "components": {
            "task_completion_rate": round(float(components["task_completion_rate"]), 4),
            "weekly_consistency": round(float(components["weekly_consistency"]), 4),
            "execution_velocity": round(float(components["execution_velocity"]), 4),
            "focus_score": round(float(components["focus_score"]), 4),
            "milestone_completion_rate": round(float(components["milestone_completion_rate"]), 4),
            "feedback_positivity_ratio": round(float(components["feedback_positivity_ratio"]), 4),
        },
        "history": history,
    }


def get_execution_score_analytics(db: Session, user_id: int) -> dict:
    components = calculate_score_components(db, user_id=user_id)
    score = calculate_execution_score(components)
    store_weekly_score(db, user_id=user_id, score=score)

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=6)

    history = (
        db.query(ExecutionScoreHistory)
        .filter(ExecutionScoreHistory.user_id == user_id, ExecutionScoreHistory.calculated_at >= start)
        .order_by(ExecutionScoreHistory.calculated_at.asc())
        .all()
    )
    score_series = [{"date": h.calculated_at.date().isoformat(), "score": float(h.score)} for h in history]

    completed_rows = (
        db.query(Task.completed_at)
        .join(Milestone, Task.milestone_id == Milestone.id)
        .join(Project, Milestone.project_id == Project.id)
        .filter(
            Project.user_id == user_id,
            Task.is_completed.is_(True),
            Task.completed_at.is_not(None),
            Task.completed_at >= start,
        )
        .all()
    )
    completion_map = {}
    for row in completed_rows:
        k = row.completed_at.date().isoformat()
        completion_map[k] = completion_map.get(k, 0) + 1
    completion_series = []
    for i in range(7):
        day = (start + timedelta(days=i)).date().isoformat()
        completion_series.append({"date": day, "tasks_completed": int(completion_map.get(day, 0))})

    milestone_rows = (
        db.query(Milestone.id, func.max(Task.completed_at).label("completed_at"))
        .join(Project, Milestone.project_id == Project.id)
        .join(Task, Task.milestone_id == Milestone.id)
        .filter(
            Project.user_id == user_id,
            Milestone.is_completed.is_(True),
            Task.completed_at.is_not(None),
            Task.completed_at >= start,
        )
        .group_by(Milestone.id)
        .all()
    )
    ms_map = {}
    for row in milestone_rows:
        d = row.completed_at.date().isoformat()
        ms_map[d] = ms_map.get(d, 0) + 1
    milestone_series = []
    for i in range(7):
        day = (start + timedelta(days=i)).date().isoformat()
        milestone_series.append({"date": day, "milestones_completed": int(ms_map.get(day, 0))})

    return {
        "score": float(score),
        "completion_rate": round(float(components["task_completion_rate"]), 4),
        "weekly_consistency": round(float(components["weekly_consistency"]), 4),
        "velocity": round(float(components["execution_velocity"]), 4),
        "focus_score": round(float(components["focus_score"]), 4),
        "chart_data": {
            "execution_score_trend": score_series,
            "weekly_task_completion": completion_series,
            "milestone_progress": milestone_series,
        },
    }
