from sqlalchemy.orm import Session

from app.execution.scoring import calculate_execution_score, calculate_score_components, store_weekly_score
from app.models import ExecutionScoreHistory


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
            "milestone_completion_rate": round(float(components["milestone_completion_rate"]), 4),
            "feedback_positivity_ratio": round(float(components["feedback_positivity_ratio"]), 4),
        },
        "history": history,
    }
