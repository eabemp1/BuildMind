from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.core.deps import get_current_user
from backend.app.database import get_db
from backend.app.models import User
from backend.app.schemas.feedback import FeedbackRequest, FeedbackResponse
from backend.app.services.feedback_service import create_feedback


router = APIRouter(tags=["feedback"])


@router.post("/feedback", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
def feedback_endpoint(
    payload: FeedbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        row = create_feedback(
            db,
            user_id=current_user.id,
            task_id=payload.task_id,
            feedback_type=payload.feedback_type,
        )
        db.commit()
        db.refresh(row)
        return FeedbackResponse(
            id=row.id,
            user_id=row.user_id,
            task_id=row.task_id,
            feedback_type=row.feedback_type,
            created_at=row.created_at,
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


