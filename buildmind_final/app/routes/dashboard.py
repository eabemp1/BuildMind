from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.dashboard import DashboardResponse, ExecutionScoreSnapshotOut
from app.services.dashboard_service import build_dashboard
from app.services.buildmind_service import build_buildmind_dashboard


router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
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
    payload = DashboardResponse(
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
    return {"success": True, "data": payload.dict()}


@router.get("/dashboard/buildmind")
def buildmind_dashboard_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = build_buildmind_dashboard(db, user_id=current_user.id)
    return {
        "success": True,
        "data": {
            "execution_score": data["execution_score"],
            "execution_streak": data["execution_streak"],
            "journey_progress": data["journey_progress"],
            "active_projects": data["active_projects"],
            "recent_activity": [
                {
                    "id": row.id,
                    "activity_type": row.activity_type,
                    "reference_id": row.reference_id,
                    "created_at": row.created_at,
                }
                for row in data["recent_activity"]
            ],
            "notifications": [
                {
                    "id": row.id,
                    "type": row.type,
                    "message": row.message,
                    "reference_id": row.reference_id,
                    "is_read": row.is_read,
                    "created_at": row.created_at,
                }
                for row in data["notifications"]
            ],
            "next_actions": data["next_actions"],
            "weekly_progress": data["weekly_progress"],
        },
    }



