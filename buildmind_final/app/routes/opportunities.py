from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.services.opportunities_service import get_recommended_opportunities


router = APIRouter(tags=["opportunities"])


@router.get("/opportunities/recommended")
def opportunities_recommended_endpoint(
    limit: int = 5,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = get_recommended_opportunities(db, user_id=current_user.id, limit=limit)
    return {"success": True, "data": payload}
