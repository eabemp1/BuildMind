from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.reminder import ReminderPreferenceOut, ReminderPreferenceUpsertRequest
from app.services.reminder_service import get_reminder_preference, upsert_reminder_preference


router = APIRouter(tags=["reminder"])


@router.get("/reminder/preferences")
def get_reminder_preferences_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = get_reminder_preference(db, user_id=current_user.id)
    if not row:
        return {"success": True, "data": None}
    payload = ReminderPreferenceOut(
        user_id=row.user_id,
        reminder_time=row.reminder_time,
        enabled=row.enabled,
        updated_at=row.updated_at,
        last_triggered_at=row.last_triggered_at,
    )
    return {"success": True, "data": payload.dict()}


@router.post("/reminder/preferences")
def set_reminder_preferences_endpoint(
    payload: ReminderPreferenceUpsertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = upsert_reminder_preference(
        db,
        user_id=current_user.id,
        reminder_time=payload.reminder_time,
        enabled=payload.enabled,
    )
    db.commit()
    out = ReminderPreferenceOut(
        user_id=row.user_id,
        reminder_time=row.reminder_time,
        enabled=row.enabled,
        updated_at=row.updated_at,
        last_triggered_at=row.last_triggered_at,
    )
    return {"success": True, "data": out.dict()}


@router.get("/reminders")
def get_reminders_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_reminder_preferences_endpoint(db=db, current_user=current_user)


@router.post("/reminders")
def post_reminders_endpoint(
    payload: ReminderPreferenceUpsertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return set_reminder_preferences_endpoint(payload=payload, db=db, current_user=current_user)
