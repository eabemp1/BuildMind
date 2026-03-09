from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.project import (
    MilestoneReorderRequest,
    MilestoneUpdateRequest,
    TaskCreateRequest,
    TaskUpdateRequest,
)
from app.services.task_service import (
    complete_task_for_user,
    create_task_for_user,
    delete_task_for_user,
    reorder_milestones_for_user,
    update_milestone_for_user,
    update_task_for_user,
)


router = APIRouter(tags=["tasks"])


@router.post("/tasks/{task_id}/complete")
def complete_task_endpoint(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        task = complete_task_for_user(db, user_id=current_user.id, task_id=task_id)
        db.commit()
        return {
            "success": True,
            "data": {
                "id": task.id,
                "milestone_id": task.milestone_id,
                "description": task.description,
                "is_completed": task.is_completed,
                "completed_at": task.completed_at,
            },
        }
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/milestones/{milestone_id}/tasks", status_code=status.HTTP_201_CREATED)
def create_task_endpoint(
    milestone_id: int,
    payload: TaskCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        task = create_task_for_user(
            db,
            user_id=current_user.id,
            milestone_id=milestone_id,
            title=payload.title,
            description=payload.description,
            status=payload.status,
            priority=payload.priority,
            due_date=payload.due_date,
        )
        db.commit()
        return {
            "success": True,
            "data": {
                "id": task.id,
                "milestone_id": task.milestone_id,
                "title": task.title,
                "description": task.description,
                "status": task.status,
                "priority": task.priority,
                "due_date": task.due_date,
                "is_completed": task.is_completed,
                "completed_at": task.completed_at,
            },
        }
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.patch("/tasks/{task_id}")
def update_task_endpoint(
    task_id: int,
    payload: TaskUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        task = update_task_for_user(
            db,
            user_id=current_user.id,
            task_id=task_id,
            title=payload.title,
            description=payload.description,
            status=payload.status,
            priority=payload.priority,
            due_date=payload.due_date,
        )
        db.commit()
        return {
            "success": True,
            "data": {
                "id": task.id,
                "title": task.title,
                "description": task.description,
                "status": task.status,
                "priority": task.priority,
                "due_date": task.due_date,
                "is_completed": task.is_completed,
                "completed_at": task.completed_at,
            },
        }
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/tasks/{task_id}")
def delete_task_endpoint(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        delete_task_for_user(db, user_id=current_user.id, task_id=task_id)
        db.commit()
        return {"success": True, "data": {"message": "Task deleted"}}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.patch("/milestones/{milestone_id}")
def update_milestone_endpoint(
    milestone_id: int,
    payload: MilestoneUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        milestone = update_milestone_for_user(
            db,
            user_id=current_user.id,
            milestone_id=milestone_id,
            title=payload.title,
            status=payload.status,
            order_index=payload.order_index,
        )
        db.commit()
        return {
            "success": True,
            "data": {
                "id": milestone.id,
                "title": milestone.title,
                "status": milestone.status,
                "order_index": milestone.order_index,
                "completed_at": milestone.completed_at,
                "is_completed": milestone.is_completed,
            },
        }
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/projects/{project_id}/milestones/reorder")
def reorder_milestones_endpoint(
    project_id: int,
    payload: MilestoneReorderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        milestones = reorder_milestones_for_user(
            db,
            user_id=current_user.id,
            project_id=project_id,
            items=[{"milestone_id": item.milestone_id, "order_index": item.order_index} for item in payload.items],
        )
        db.commit()
        return {
            "success": True,
            "data": [
                {
                    "id": milestone.id,
                    "title": milestone.title,
                    "order_index": milestone.order_index,
                    "status": milestone.status,
                }
                for milestone in milestones
            ],
        }
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))



