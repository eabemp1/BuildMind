"""AI coaching and milestone generation endpoints — typed, rate-limited."""

import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.database import get_db
from app.models import Project, StartupMetrics, ValidationData
from app.schemas.buildmind import AiCoachRequest, AiMilestonesRequest
from app.services.ai_service import generate_ai_response, generate_milestones_from_idea


router = APIRouter(tags=["ai"])

SYSTEM_PROMPT = (
    "You are an experienced startup advisor helping founders with product-market fit, MVP building, "
    "growth strategy, customer discovery, and fundraising preparation. "
    "Always structure your response with:\nInsight:\nAdvice:\nNext Steps:\n"
)


@router.post("/ai/coach")
@limiter.limit("20/minute")
def ai_coach_endpoint(
    request: Request,
    payload: AiCoachRequest,
    db: Session = Depends(get_db),
):
    question = payload.get_question()
    if not question:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="question is required")

    context = ""
    structured_context: dict = {}

    if payload.project:
        proj = payload.project
        context = (
            f"Project title: {proj.get('title', '')}\n"
            f"Description: {proj.get('description', '')}\n"
            f"Problem: {proj.get('problem', '')}\n"
            f"Target users: {proj.get('target_users', '')}\n"
        )
        structured_context = {
            "industry": proj.get("industry"),
            "target_market": proj.get("target_market"),
            "revenue_model": proj.get("revenue_model"),
            "startup_stage": proj.get("startup_stage"),
            "validation_data": proj.get("validation_data") or {},
            "startup_metrics": proj.get("startup_metrics") or {},
        }
    elif payload.projectId:
        project = db.query(Project).filter(Project.id == payload.projectId).first()
        if project:
            context = (
                f"Project title: {project.title}\n"
                f"Description: {project.description or ''}\n"
                f"Problem: {project.problem or ''}\n"
                f"Target users: {project.target_users or ''}\n"
            )
            vd = db.query(ValidationData).filter(ValidationData.project_id == project.id).first()
            sm = db.query(StartupMetrics).filter(StartupMetrics.project_id == project.id).first()
            structured_context = {
                "industry": project.industry,
                "target_market": project.target_market,
                "revenue_model": project.revenue_model,
                "startup_stage": project.startup_stage,
                "validation_data": {
                    "users_interviewed": vd.users_interviewed,
                    "interested_users": vd.interested_users,
                    "preorders": vd.preorders,
                    "feedback_sentiment": vd.feedback_sentiment,
                } if vd else {},
                "startup_metrics": {
                    "milestones_completed": sm.milestones_completed,
                    "tasks_completed": sm.tasks_completed,
                    "early_users": sm.early_users,
                    "active_users": sm.active_users,
                    "execution_streak": sm.execution_streak,
                } if sm else {},
            }

    user_content = (
        f"{context}Provide concise, actionable coaching.\n"
        f"Structured context: {json.dumps(structured_context, ensure_ascii=False)}\n"
        f"Founder question: {question}"
    )

    try:
        response = generate_ai_response(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.7,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI provider error: {exc}") from exc

    return {"success": True, "data": {"message": response}}


@router.post("/ai/milestones")
@limiter.limit("30/minute")
def ai_milestones_endpoint(
    request: Request,
    payload: AiMilestonesRequest,
):
    idea = payload.get_idea()
    if not idea:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="idea is required")
    milestones = generate_milestones_from_idea(idea)
    return {"success": True, "data": {"message": "Milestones generated", "milestones": milestones}}
