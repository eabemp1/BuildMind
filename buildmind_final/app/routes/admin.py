from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_admin
from app.database import get_db
from app.models import ActivityLog, AppState, Feedback, User
from app.schemas.buildmind import (
    AdminAiUsageOut,
    AdminNotificationRequest,
    AdminPlatformAnalyticsOut,
    AdminProjectOut,
    AdminUserOut,
)
from app.services.buildmind_service import (
    broadcast_platform_notification,
    build_admin_platform_analytics,
    delete_user_account,
    list_admin_ai_usage,
    list_admin_projects,
    list_admin_users,
    list_all_feedback,
    list_activities_for_user,
    list_newsletter_subscribers,
    set_user_admin_status,
    set_user_active_status,
)


router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard")
def admin_dashboard(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    data = build_admin_platform_analytics(db)
    return {"success": True, "data": AdminPlatformAnalyticsOut(**data).dict()}


@router.get("/users")
def admin_users(
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    rows = list_admin_users(db, query=q)
    return {
        "success": True,
        "data": [
            AdminUserOut(
                id=row["id"],
                username=row["username"],
                email=row["email"],
                is_active=row["is_active"],
                is_admin=row["is_admin"],
                created_at=row["created_at"],
                project_count=row["project_count"],
            ).dict()
            for row in rows
        ],
    }


@router.patch("/users/{user_id}/suspend")
def admin_suspend_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    try:
        user = set_user_active_status(db, user_id=user_id, is_active=False)
        db.commit()
        return {"success": True, "data": {"id": user.id, "is_active": user.is_active}}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.patch("/users/{user_id}/promote")
def admin_promote_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    try:
        user = set_user_admin_status(db, user_id=user_id, is_admin=True)
        db.commit()
        return {"success": True, "data": {"id": user.id, "is_admin": user.is_admin}}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    try:
        delete_user_account(db, user_id=user_id)
        db.commit()
        return {"success": True, "data": {"message": "User deleted"}}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/users/{user_id}/activity")
def admin_user_activity(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    rows = list_activities_for_user(db, user_id=user_id, limit=200)
    return {
        "success": True,
        "data": [
            {
                "id": row.id,
                "user_id": row.user_id,
                "activity_type": row.activity_type,
                "reference_id": row.reference_id,
                "created_at": row.created_at,
            }
            for row in rows
        ],
    }


@router.get("/projects")
def admin_projects(
    stage: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    rows = list_admin_projects(db, stage=stage)
    return {"success": True, "data": [AdminProjectOut(**row).dict() for row in rows]}


@router.get("/projects/{project_id}")
def admin_project_detail(
    project_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    rows = [row for row in list_admin_projects(db, stage=None) if row["id"] == project_id]
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return {"success": True, "data": AdminProjectOut(**rows[0]).dict()}


@router.get("/feedback")
def admin_feedback(
    sort: str = Query(default="created_at"),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    rows = list_all_feedback(db)
    if sort == "rating":
        rows = sorted(rows, key=lambda x: (x.rating or 0), reverse=True)
    return {
        "success": True,
        "data": [
            {
                "id": row.id,
                "project_id": row.project_id,
                "user_id": row.user_id,
                "rating": row.rating,
                "category": row.category,
                "comment": row.comment,
                "created_at": row.created_at,
            }
            for row in rows
        ],
    }


@router.delete("/feedback/{feedback_id}")
def admin_delete_feedback(
    feedback_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    row = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")
    db.delete(row)
    db.commit()
    return {"success": True, "data": {"message": "Feedback deleted"}}


@router.get("/newsletter")
def admin_newsletter(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    rows = list_newsletter_subscribers(db)
    return {
        "success": True,
        "data": [
            {
                "id": row.id,
                "email": row.email,
                "subscribed": row.subscribed,
                "created_at": row.created_at,
            }
            for row in rows
        ],
    }


@router.get("/newsletter/export")
def admin_newsletter_export(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    rows = [row.email for row in list_newsletter_subscribers(db) if row.subscribed]
    return {"success": True, "data": {"emails": rows, "count": len(rows)}}


@router.get("/activity")
def admin_activity(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    rows = db.query(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(500).all()
    return {
        "success": True,
        "data": [
            {
                "id": row.id,
                "user_id": row.user_id,
                "activity_type": row.activity_type,
                "reference_id": row.reference_id,
                "created_at": row.created_at,
            }
            for row in rows
        ],
    }


@router.get("/system-settings")
def admin_system_settings(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    rows = db.query(AppState).all()
    return {"success": True, "data": [{"key": row.key, "value_json": row.value_json} for row in rows]}


@router.post("/system-settings")
def admin_set_system_setting(
    payload: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    key = str(payload.get("key", "")).strip()
    value_json = str(payload.get("value_json", "")).strip()
    if not key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="key is required")
    row = db.query(AppState).filter(AppState.key == key).first()
    if row is None:
        row = AppState(key=key, value_json=value_json)
    else:
        row.value_json = value_json
    db.add(row)
    db.commit()
    return {"success": True, "data": {"key": row.key, "value_json": row.value_json}}


@router.get("/ai-usage")
def admin_ai_usage(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    rows = list_admin_ai_usage(db)
    return {"success": True, "data": [AdminAiUsageOut(**row).dict() for row in rows]}


@router.post("/notifications")
def admin_send_notification(
    payload: AdminNotificationRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    sent = broadcast_platform_notification(db, message=payload.message, notification_type=payload.type)
    db.commit()
    return {"success": True, "data": {"sent_count": sent, "message": payload.message, "type": payload.type}}
