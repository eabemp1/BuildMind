from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.core.deps import get_current_user
from backend.app.database import get_db
from backend.app.models import User
from backend.app.schemas.dashboard import DashboardResponse, ExecutionScoreSnapshotOut
from backend.app.services.dashboard_service import build_dashboard


router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = build_dashboard(db, user_id=current_user.id)
    db.commit()

    history = [
        ExecutionScoreSnapshotOut(id=item.id, score=item.score, calculated_at=item.calculated_at)
        for item in data["score_history"]
    ]
    return DashboardResponse(
        user_id=data["user_id"],
        project_count=data["project_count"],
        milestone_count=data["milestone_count"],
        task_count=data["task_count"],
        task_completion_rate=data["task_completion_rate"],
        weekly_consistency=data["weekly_consistency"],
        milestone_completion_rate=data["milestone_completion_rate"],
        feedback_positivity_ratio=data["feedback_positivity_ratio"],
        execution_score=data["execution_score"],
        score_history=history,
    )


