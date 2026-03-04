from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.project import (
    ProjectCreateRequest,
    RoadmapGenerateRequest,
    ProjectOut,
    MilestoneOut,
    TaskOut,
)
from app.services.project_service import create_project, get_project_for_user, generate_project_roadmap, list_projects_for_user


router = APIRouter(tags=["projects"])


def _to_project_out(project) -> ProjectOut:
    milestones = []
    for ms in sorted(project.milestones, key=lambda x: (x.week_number, x.id)):
        tasks = [
            TaskOut(
                id=t.id,
                description=t.description,
                is_completed=t.is_completed,
                completed_at=t.completed_at,
            )
            for t in sorted(ms.tasks, key=lambda x: x.id)
        ]
        milestones.append(
            MilestoneOut(
                id=ms.id,
                title=ms.title,
                week_number=ms.week_number,
                is_completed=ms.is_completed,
                tasks=tasks,
            )
        )
    return ProjectOut(
        id=project.id,
        user_id=project.user_id,
        title=project.title,
        description=project.description,
        created_at=project.created_at,
        milestones=milestones,
    )


@router.post("/projects", status_code=status.HTTP_201_CREATED)
def create_project_endpoint(
    payload: ProjectCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = create_project(db, user_id=current_user.id, title=payload.title, description=payload.description)
    db.commit()
    full = get_project_for_user(db, current_user.id, row.id)
    return {"success": True, "data": _to_project_out(full).dict()}


@router.get("/projects")
def list_projects_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    projects = list_projects_for_user(db, user_id=current_user.id)
    return {"success": True, "data": [_to_project_out(project).dict() for project in projects]}


@router.post("/projects/{project_id}/generate-roadmap")
def generate_roadmap_endpoint(
    project_id: int,
    payload: RoadmapGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        project = generate_project_roadmap(
            db,
            user_id=current_user.id,
            project_id=project_id,
            goal_duration_weeks=payload.goal_duration_weeks,
        )
        db.commit()
        return {"success": True, "data": _to_project_out(project).dict()}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/projects/{project_id}")
def get_project_endpoint(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_for_user(db, user_id=current_user.id, project_id=project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return {"success": True, "data": _to_project_out(project).dict()}



