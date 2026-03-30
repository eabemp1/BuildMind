from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.startup import (
    StartupMetricsCreateRequest,
    StartupMetricsOut,
    ValidationDataCreateRequest,
    ValidationDataOut,
)
from app.services.startup_data_service import (
    get_startup_metrics_for_project,
    get_validation_data_for_project,
    upsert_startup_metrics,
    upsert_validation_data,
)


router = APIRouter(tags=["startup-data"])


@router.post("/validation-data", status_code=status.HTTP_201_CREATED)
def upsert_validation_data_endpoint(
    payload: ValidationDataCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        row = upsert_validation_data(
            db,
            user_id=current_user.id,
            project_id=payload.project_id,
            users_interviewed=payload.users_interviewed,
            interested_users=payload.interested_users,
            preorders=payload.preorders,
            feedback_sentiment=payload.feedback_sentiment,
        )
        db.commit()
        return {"success": True, "data": ValidationDataOut(**row.__dict__).dict()}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/validation-data/{project_id}")
def get_validation_data_endpoint(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        row = get_validation_data_for_project(db, user_id=current_user.id, project_id=project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if not row:
        return {"success": True, "data": None}
    return {"success": True, "data": ValidationDataOut(**row.__dict__).dict()}


@router.post("/startup-metrics", status_code=status.HTTP_201_CREATED)
def upsert_startup_metrics_endpoint(
    payload: StartupMetricsCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        row = upsert_startup_metrics(
            db,
            user_id=current_user.id,
            project_id=payload.project_id,
            milestones_completed=payload.milestones_completed,
            tasks_completed=payload.tasks_completed,
            early_users=payload.early_users,
            active_users=payload.active_users,
            execution_streak=payload.execution_streak,
        )
        db.commit()
        return {"success": True, "data": StartupMetricsOut(**row.__dict__).dict()}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/startup-metrics/{project_id}")
def get_startup_metrics_endpoint(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        row = get_startup_metrics_for_project(db, user_id=current_user.id, project_id=project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if not row:
        return {"success": True, "data": None}
    return {"success": True, "data": StartupMetricsOut(**row.__dict__).dict()}
