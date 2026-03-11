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
    question = str(payload.get("question") or payload.get("message") or "").strip()
    if not question:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="question is required")

    context = ""
    if payload.get("project"):
        proj = payload.get("project") or {}
        context = (
            f"Project title: {proj.get('title','')}\n"
            f"Description: {proj.get('description','')}\n"
            f"Problem: {proj.get('problem','')}\n"
            f"Target users: {proj.get('target_users','')}\n"
        )
    else:
        raw_id = payload.get("projectId")
        try:
            project_id = int(raw_id)
        except Exception:
            project_id = 0
        if project_id:
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                context = (
                    f"Project title: {project.title}\n"
                    f"Description: {project.description or ''}\n"
                    f"Problem: {project.problem or ''}\n"
                    f"Target users: {project.target_users or ''}\n"
                )

    context = context + "Provide concise, actionable coaching."
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
