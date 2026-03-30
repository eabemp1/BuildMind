from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import ReminderPreference


def get_reminder_preference(db: Session, user_id: int) -> ReminderPreference | None:
    return db.query(ReminderPreference).filter(ReminderPreference.user_id == user_id).first()


def upsert_reminder_preference(db: Session, user_id: int, reminder_time: str, enabled: bool) -> ReminderPreference:
    row = get_reminder_preference(db, user_id=user_id)
    now = datetime.now(timezone.utc)
    if row:
        row.reminder_time = reminder_time
        row.enabled = bool(enabled)
        row.updated_at = now
        db.add(row)
        db.flush()
        return row

    row = ReminderPreference(
        user_id=user_id,
        reminder_time=reminder_time,
        enabled=bool(enabled),
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return row
