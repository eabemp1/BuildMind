from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.core.deps import get_current_user
from backend.app.database import get_db
from backend.app.models import User
from backend.app.schemas.task import CompleteTaskResponse
from backend.app.services.task_service import complete_task_for_user


router = APIRouter(tags=["tasks"])


@router.post("/tasks/{task_id}/complete", response_model=CompleteTaskResponse)
def complete_task_endpoint(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        task = complete_task_for_user(db, user_id=current_user.id, task_id=task_id)
        db.commit()
        return CompleteTaskResponse(
            id=task.id,
            milestone_id=task.milestone_id,
            description=task.description,
            is_completed=task.is_completed,
            completed_at=task.completed_at,
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


