"""Dashboard aggregation service."""

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.models import Project, Milestone, Task, ExecutionScoreHistory
from backend.app.execution.scoring import (
    calculate_score_components,
    calculate_execution_score,
    store_weekly_score,
)


def build_dashboard(db: Session, user_id: int) -> dict:
    project_count = db.query(func.count(Project.id)).filter(Project.user_id == user_id).scalar() or 0
    milestone_count = (
        db.query(func.count(Milestone.id))
        .join(Project, Milestone.project_id == Project.id)
        .filter(Project.user_id == user_id)
        .scalar()
        or 0
    )
    task_count = (
        db.query(func.count(Task.id))
        .join(Milestone, Task.milestone_id == Milestone.id)
        .join(Project, Milestone.project_id == Project.id)
        .filter(Project.user_id == user_id)
        .scalar()
        or 0
    )

    components = calculate_score_components(db, user_id=user_id)
    score = calculate_execution_score(components)
    store_weekly_score(db, user_id=user_id, score=score)

    history = (
        db.query(ExecutionScoreHistory)
        .filter(ExecutionScoreHistory.user_id == user_id)
        .order_by(ExecutionScoreHistory.calculated_at.desc())
        .limit(12)
        .all()
    )

    return {
        "user_id": user_id,
        "project_count": int(project_count),
        "milestone_count": int(milestone_count),
        "task_count": int(task_count),
        "task_completion_rate": round(float(components["task_completion_rate"]), 4),
        "weekly_consistency": round(float(components["weekly_consistency"]), 4),
        "milestone_completion_rate": round(float(components["milestone_completion_rate"]), 4),
        "feedback_positivity_ratio": round(float(components["feedback_positivity_ratio"]), 4),
        "execution_score": float(score),
        "score_history": history,
    }

