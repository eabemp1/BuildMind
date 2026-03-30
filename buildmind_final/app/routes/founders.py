from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.public import FounderProfileOut
from app.services.public_project_service import get_founder_profile


router = APIRouter(tags=["founders"])


@router.get("/founder/{username}")
def founder_profile_endpoint(username: str, db: Session = Depends(get_db)):
    payload = get_founder_profile(db, username=username)
    if not payload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Founder not found")
    out = FounderProfileOut(**payload)
    return {"success": True, "data": out.dict()}
