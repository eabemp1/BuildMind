import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Project, StartupMetrics, ValidationData
from app.services.ai_service import generate_ai_response, generate_milestones_from_idea


router = APIRouter(tags=["ai"])

SYSTEM_PROMPT = (
    "You are an experienced startup advisor helping founders with product-market fit, MVP building, growth strategy, "
    "customer discovery, and fundraising preparation. Respond with clear, actionable guidance. "
    "Always structure your response with the following headings:\n"
    "Insight:\n"
    "Advice:\n"
    "Next Steps:\n"
)


@router.post("/ai/coach")
def ai_coach_endpoint(
    payload: dict,
    db: Session = Depends(get_db),
):
    question = str(payload.get("question") or payload.get("message") or "").strip()
    if not question:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="question is required")

    context = ""
    structured_context: dict[str, object] = {}
    if payload.get("project"):
        proj = payload.get("project") or {}
        context = (
            f"Project title: {proj.get('title','')}\n"
            f"Description: {proj.get('description','')}\n"
            f"Problem: {proj.get('problem','')}\n"
            f"Target users: {proj.get('target_users','')}\n"
        )
        structured_context = {
            "industry": proj.get("industry"),
            "target_market": proj.get("target_market"),
            "revenue_model": proj.get("revenue_model"),
            "startup_stage": proj.get("startup_stage"),
            "validation_data": proj.get("validation_data") or {},
            "startup_metrics": proj.get("startup_metrics") or {},
        }
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
                validation_data = (
                    db.query(ValidationData).filter(ValidationData.project_id == project.id).first()
                )
                startup_metrics = (
                    db.query(StartupMetrics).filter(StartupMetrics.project_id == project.id).first()
                )
                structured_context = {
                    "industry": project.industry,
                    "target_market": project.target_market,
                    "revenue_model": project.revenue_model,
                    "startup_stage": project.startup_stage,
                    "validation_data": {
                        "users_interviewed": validation_data.users_interviewed,
                        "interested_users": validation_data.interested_users,
                        "preorders": validation_data.preorders,
                        "feedback_sentiment": validation_data.feedback_sentiment,
                    }
                    if validation_data
                    else {},
                    "startup_metrics": {
                        "milestones_completed": startup_metrics.milestones_completed,
                        "tasks_completed": startup_metrics.tasks_completed,
                        "early_users": startup_metrics.early_users,
                        "active_users": startup_metrics.active_users,
                        "execution_streak": startup_metrics.execution_streak,
                    }
                    if startup_metrics
                    else {},
                }

    context = context + "Provide concise, actionable coaching."
    structured_block = json.dumps(structured_context, ensure_ascii=False)
    user_content = f"{context}\nStructured context: {structured_block}\nFounder question: {question}"
    try:
        response = generate_ai_response(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.7,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI provider error: {exc}",
        ) from exc
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
