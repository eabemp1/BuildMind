from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.feedback import FeedbackRequest, FeedbackResponse
from app.services.feedback_service import (
    create_feedback,
    get_feedback_gate_status,
    list_feedback_for_project,
    request_feedback_for_own_project,
)


router = APIRouter(tags=["feedback"])


@router.post("/feedback", status_code=status.HTTP_201_CREATED)
def feedback_endpoint(
    payload: FeedbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        row = create_feedback(
            db,
            user_id=current_user.id,
            project_id=payload.project_id,
            task_id=payload.task_id,
            feedback_type=payload.feedback_type,
            rating=payload.rating,
            category=payload.category,
            comment=payload.comment,
        )
        db.commit()
        db.refresh(row)
        payload = FeedbackResponse(
            id=row.id,
            user_id=row.user_id,
            project_id=row.project_id,
            task_id=row.task_id,
            feedback_type=row.feedback_type,
            rating=row.rating,
            category=row.category,
            comment=row.comment,
            created_at=row.created_at,
        )
        return {"success": True, "data": payload.dict()}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/projects/{project_id}/feedback")
def get_project_feedback_endpoint(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        rows = list_feedback_for_project(db, user_id=current_user.id, project_id=project_id)
        return {
            "success": True,
            "data": [
                FeedbackResponse(
                    id=row.id,
                    user_id=row.user_id,
                    project_id=row.project_id,
                    task_id=row.task_id,
                    feedback_type=row.feedback_type,
                    rating=row.rating,
                    category=row.category,
                    comment=row.comment,
                    created_at=row.created_at,
                ).dict()
                for row in rows
            ],
        }
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/feedback/unlock-status")
def feedback_unlock_status_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"success": True, "data": get_feedback_gate_status(db, user_id=current_user.id)}


@router.post("/projects/{project_id}/request-feedback")
def request_project_feedback_endpoint(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = request_feedback_for_own_project(db, user_id=current_user.id, project_id=project_id)
        db.commit()
        return {"success": True, "data": data}
    except PermissionError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))



