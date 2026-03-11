from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.public import SearchResultsOut
from app.services.public_project_service import search_global


router = APIRouter(tags=["search"])


@router.get("/search")
def search_endpoint(q: str, db: Session = Depends(get_db)):
    payload = search_global(db, query=q)
    out = SearchResultsOut(**payload)
    return {"success": True, "data": out.dict()}
