from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.scoring import ScoreComponentsOut, ScoreSnapshotOut, ScoreSummaryOut
from app.services.scoring_service import get_scoring_summary, get_execution_score_analytics


router = APIRouter(tags=["scoring"])


@router.get("/scoring")
def scoring_summary_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = get_scoring_summary(db, user_id=current_user.id)
    db.commit()

    payload = ScoreSummaryOut(
        execution_score=data["execution_score"],
        components=ScoreComponentsOut(**data["components"]),
        history=[
            ScoreSnapshotOut(id=item.id, score=item.score, calculated_at=item.calculated_at)
            for item in data["history"]
        ],
    )
    return {"success": True, "data": payload.dict()}


@router.get("/analytics/execution-score")
def execution_score_analytics_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = get_execution_score_analytics(db, user_id=current_user.id)
    db.commit()
    return payload
