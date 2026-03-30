from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import UserProfile


def get_user_profile(db: Session, user_id: int) -> UserProfile | None:
    return db.query(UserProfile).filter(UserProfile.user_id == user_id).first()


def upsert_user_profile(db: Session, user_id: int, country: str, startup_stage: str, industry: str) -> UserProfile:
    row = get_user_profile(db, user_id=user_id)
    now = datetime.now(timezone.utc)
    if row:
        row.country = str(country or "").strip() or None
        row.startup_stage = str(startup_stage or "").strip() or None
        row.industry = str(industry or "").strip() or None
        row.updated_at = now
        db.add(row)
        db.flush()
        return row

    row = UserProfile(
        user_id=user_id,
        country=str(country or "").strip() or None,
        startup_stage=str(startup_stage or "").strip() or None,
        industry=str(industry or "").strip() or None,
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return row
