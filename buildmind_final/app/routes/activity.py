from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.buildmind import ActivityOut
from app.services.buildmind_service import list_activities_for_user


router = APIRouter(tags=["activity"])


@router.get("/activity")
def get_activity_feed(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = list_activities_for_user(db, user_id=current_user.id, limit=100)
    return {
        "success": True,
        "data": [
            ActivityOut(
                id=row.id,
                user_id=row.user_id,
                activity_type=row.activity_type,
                reference_id=row.reference_id,
                created_at=row.created_at,
            ).dict()
            for row in rows
        ],
    }
