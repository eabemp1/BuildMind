from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.report import WeeklyReportOut
from app.services.report_service import build_weekly_report


router = APIRouter(tags=["reports"])


@router.get("/report/weekly")
def weekly_report_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = WeeklyReportOut(**build_weekly_report(db, user_id=current_user.id))
    return {"success": True, "data": payload.dict()}
