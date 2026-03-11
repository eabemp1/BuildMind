from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.project import (
    ProjectCreateRequest,
    RoadmapGenerateRequest,
    AgentRoadmapGenerateRequest,
    AgentRoadmapOut,
    ProjectOut,
    MilestoneOut,
    TaskOut,
    ProjectUpdateRequest,
)
from app.schemas.public import (
    PublicProjectOut,
    PublicProjectDetailOut,
    PublicProjectUpdateOut,
    PublicProjectUpdateCreateRequest,
    PublicProjectCommentCreateRequest,
)
from app.services.project_service import (
    archive_project_for_user,
    create_project,
    delete_project_for_user,
    get_project_for_user,
    update_project_for_user,
    generate_project_stage_roadmap,
    generate_project_roadmap,
    list_projects_for_user,
    generate_agent_startup_roadmap,
)
from app.services.public_project_service import (
    list_public_projects,
    get_public_project,
    add_project_update,
    like_project,
    follow_project,
    add_project_comment,
)


router = APIRouter(tags=["projects"])


def _to_project_out(project) -> ProjectOut:
    milestones = []
    for ms in sorted(project.milestones, key=lambda x: (x.order_index, x.id)):
        tasks = [
            TaskOut(
                id=t.id,
                title=t.title,
                description=t.description,
                status=t.status,
                priority=t.priority,
                due_date=t.due_date,
                is_completed=t.is_completed,
                completed_at=t.completed_at,
            )
            for t in sorted(ms.tasks, key=lambda x: x.id)
        ]
        milestones.append(
            MilestoneOut(
                id=ms.id,
                title=ms.title,
                status=ms.status,
                order_index=ms.order_index,
                completed_at=ms.completed_at,
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
        problem=project.problem,
        target_users=project.target_users,
        progress=project.progress,
        is_public=project.is_public,
        likes=project.likes,
        followers=project.followers,
        is_archived=project.is_archived,
        archived_at=project.archived_at,
        created_at=project.created_at,
        milestones=milestones,
    )


@router.post("/projects", status_code=status.HTTP_201_CREATED)
def create_project_endpoint(
    payload: ProjectCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = create_project(
        db,
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        problem=payload.problem,
        target_users=payload.target_users,
    )
    if payload.is_public is not None:
        row.is_public = bool(payload.is_public)
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
    payload: RoadmapGenerateRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        if payload and payload.goal_duration_weeks:
            project = generate_project_roadmap(
                db,
                user_id=current_user.id,
                project_id=project_id,
                goal_duration_weeks=payload.goal_duration_weeks,
            )
        else:
            project = generate_project_stage_roadmap(
                db,
                user_id=current_user.id,
                project_id=project_id,
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


@router.patch("/projects/{project_id}")
def update_project_endpoint(
    project_id: int,
    payload: ProjectUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        project = update_project_for_user(
            db,
            user_id=current_user.id,
            project_id=project_id,
            title=payload.title,
            description=payload.description,
            problem=payload.problem,
            target_users=payload.target_users,
            progress=payload.progress,
        )
        if payload.is_public is not None:
            project.is_public = bool(payload.is_public)
            db.add(project)
        db.commit()
        return {"success": True, "data": _to_project_out(project).dict()}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/projects/{project_id}/archive")
def archive_project_endpoint(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        project = archive_project_for_user(db, user_id=current_user.id, project_id=project_id)
        db.commit()
        return {
            "success": True,
            "data": {
                "id": project.id,
                "is_archived": project.is_archived,
                "archived_at": project.archived_at,
            },
        }
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/projects/{project_id}")
def delete_project_endpoint(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        delete_project_for_user(db, user_id=current_user.id, project_id=project_id)
        db.commit()
        return {"success": True, "data": {"message": "Project deleted"}}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/projects/public")
def list_public_projects_endpoint(db: Session = Depends(get_db)):
    payload = [PublicProjectOut(**item).dict() for item in list_public_projects(db)]
    return {"success": True, "data": payload}


@router.get("/projects/{project_id}/public")
def get_public_project_endpoint(project_id: int, db: Session = Depends(get_db)):
    item = get_public_project(db, project_id=project_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Public project not found")
    payload = PublicProjectDetailOut(**item).dict()
    return {"success": True, "data": payload}


@router.post("/projects/{project_id}/like")
def like_project_endpoint(project_id: int, db: Session = Depends(get_db)):
    try:
        project = like_project(db, project_id=project_id)
        db.commit()
        return {"success": True, "data": {"id": project.id, "likes": project.likes}}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/projects/{project_id}/follow")
def follow_project_endpoint(project_id: int, db: Session = Depends(get_db)):
    try:
        project = follow_project(db, project_id=project_id)
        db.commit()
        return {"success": True, "data": {"id": project.id, "followers": project.followers}}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/projects/{project_id}/update")
def create_project_update_endpoint(
    project_id: int,
    payload: PublicProjectUpdateCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        update = add_project_update(db, user_id=current_user.id, project_id=project_id, content=payload.content)
        db.commit()
        out = PublicProjectUpdateOut(
            id=update.id,
            project_id=update.project_id,
            user_id=update.user_id,
            content=update.content,
            created_at=update.created_at,
        )
        return {"success": True, "data": out.dict()}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/projects/{project_id}/comment")
def create_project_comment_endpoint(
    project_id: int,
    payload: PublicProjectCommentCreateRequest,
    db: Session = Depends(get_db),
):
    try:
        comment = add_project_comment(
            db,
            project_id=project_id,
            author_name=payload.author_name,
            content=payload.content,
        )
        db.commit()
        return {
            "success": True,
            "data": {
                "id": comment.id,
                "project_id": comment.project_id,
                "author_name": comment.author_name,
                "content": comment.content,
                "created_at": comment.created_at,
            },
        }
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/agent/generate-roadmap")
def generate_agent_roadmap_endpoint(
    payload: AgentRoadmapGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = generate_agent_startup_roadmap(
        db=db,
        user_id=current_user.id,
        idea_description=payload.idea_description,
        country=payload.country,
        industry=payload.industry,
        stage=payload.stage,
    )
    db.commit()
    out = AgentRoadmapOut(roadmap=result["roadmap"])
    return {"success": True, "data": out.dict()}



