from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.report import FounderWeeklyReportOut
from app.services.weekly_report_service import generate_founder_report, get_latest_weekly_report


router = APIRouter(tags=["reports"])


@router.get("/reports/weekly")
def get_weekly_report_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = get_latest_weekly_report(db, user_id=current_user.id)
    if not report:
        report = generate_founder_report(db, user_id=current_user.id)
        db.commit()

    payload = FounderWeeklyReportOut(
        week_start_date=report.week_start_date.date(),
        projects_count=report.projects_count,
        milestones_completed=report.milestones_completed,
        tasks_completed=report.tasks_completed,
        ai_summary=report.ai_summary,
        ai_risks=report.ai_risks,
        ai_suggestions=report.ai_suggestions,
    )
    return {"success": True, "data": payload.dict()}
