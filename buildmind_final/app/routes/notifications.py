from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.buildmind import (
    NotificationOut,
    NotificationPreferenceOut,
    NotificationPreferenceRequest,
)
from app.services.buildmind_service import (
    ensure_notification_preference,
    list_notifications_for_user,
    mark_notification_as_read,
    update_notification_preference,
)


router = APIRouter(tags=["notifications"])


@router.get("/notifications")
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = list_notifications_for_user(db, user_id=current_user.id, limit=100)
    return {
        "success": True,
        "data": [
            NotificationOut(
                id=row.id,
                user_id=row.user_id,
                type=row.type,
                message=row.message,
                reference_id=row.reference_id,
                is_read=row.is_read,
                created_at=row.created_at,
            ).dict()
            for row in rows
        ],
    }


@router.patch("/notifications/{notification_id}/read")
def read_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        row = mark_notification_as_read(db, user_id=current_user.id, notification_id=notification_id)
        db.commit()
        return {
            "success": True,
            "data": NotificationOut(
                id=row.id,
                user_id=row.user_id,
                type=row.type,
                message=row.message,
                reference_id=row.reference_id,
                is_read=row.is_read,
                created_at=row.created_at,
            ).dict(),
        }
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/notifications/preferences")
def get_notification_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pref = ensure_notification_preference(db, user_id=current_user.id)
    return {
        "success": True,
        "data": NotificationPreferenceOut(
            user_id=pref.user_id,
            feedback_received=pref.feedback_received,
            milestone_completed=pref.milestone_completed,
            task_assigned=pref.task_assigned,
            updated_at=pref.updated_at,
        ).dict(),
    }


@router.post("/notifications/preferences")
def save_notification_preferences(
    payload: NotificationPreferenceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pref = update_notification_preference(
        db,
        user_id=current_user.id,
        feedback_received=payload.feedback_received,
        milestone_completed=payload.milestone_completed,
        task_assigned=payload.task_assigned,
    )
    db.commit()
    return {
        "success": True,
        "data": NotificationPreferenceOut(
            user_id=pref.user_id,
            feedback_received=pref.feedback_received,
            milestone_completed=pref.milestone_completed,
            task_assigned=pref.task_assigned,
            updated_at=pref.updated_at,
        ).dict(),
    }
