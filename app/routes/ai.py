from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Project
from app.services.ai_service import generate_ai_response, generate_milestones_from_idea


router = APIRouter(tags=["ai"])


@router.post("/ai/coach")
def ai_coach_endpoint(
    payload: dict,
    db: Session = Depends(get_db),
):
    project_id = int(payload.get("projectId") or 0)
    question = str(payload.get("question") or payload.get("message") or "").strip()
    if not project_id or not question:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="projectId and question are required")

    project = (
        db.query(Project).filter(Project.id == project_id).first()
    )
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    context = (
        f"Project title: {project.title}\n"
        f"Description: {project.description or ''}\n"
        f"Problem: {project.problem or ''}\n"
        f"Target users: {project.target_users or ''}\n"
        "Provide concise, actionable coaching."
    )
    response = generate_ai_response(
        messages=[
            {"role": "system", "content": "You are a pragmatic startup coach."},
            {"role": "user", "content": context},
            {"role": "user", "content": question},
        ],
        temperature=0.7,
    )
    return {"success": True, "data": {"message": response}}


@router.post("/ai/milestones")
def ai_milestones_endpoint(
    payload: dict,
):
    idea = str(payload.get("idea") or payload.get("description") or "").strip()
    if not idea:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="idea is required")
    milestones = generate_milestones_from_idea(idea)
    return {"success": True, "data": {"message": "Milestones generated", "milestones": milestones}}
