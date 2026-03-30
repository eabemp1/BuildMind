"""AI routes — stateless, reads project context from request payload.

All project/milestone/task data is owned by Supabase.
The frontend sends the relevant context in each request body.
This backend never reads from its own DB for project data.
"""

import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.ai_service import generate_ai_response, generate_milestones_from_idea

router = APIRouter(tags=["ai"])

COACH_SYSTEM_PROMPT = (
    "You are a pragmatic startup execution coach. You read the founder's actual project data "
    "before every response. Never give generic advice — always tie your response to the specific "
    "project context provided. Structure responses with:\n"
    "Insight:\n"
    "Advice:\n"
    "Next Steps:\n"
)

BREAK_SYSTEM_PROMPT = (
    "You are a brutally honest startup advisor. Your job is to find every reason a startup could fail. "
    "Do not soften the truth. Be specific, not generic. "
    "Return valid JSON only with this exact shape:\n"
    "{\n"
    '  "verdict": "one paragraph honest assessment",\n'
    '  "kill_reasons": ["reason 1", "reason 2", "reason 3"],\n'
    '  "survive_reasons": ["reason 1", "reason 2", "reason 3"],\n'
    '  "brutal_advice": "one paragraph of the single most important thing to do now",\n'
    '  "survival_probability": <integer 0-100>\n'
    "}"
)


@router.post("/ai/coach")
def ai_coach_endpoint(payload: dict):
    """
    Expects payload:
      {
        "question": "...",          # or "message"
        "project": {
          "title": "...",
          "description": "...",
          "problem": "...",
          "target_users": "...",
          "startup_stage": "...",
          "milestones": [...],
          "task_completion": "7/10"
        }
      }
    The frontend always sends project context — no DB lookup needed here.
    """
    question = str(payload.get("question") or payload.get("message") or "").strip()
    if not question:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="question is required")

    proj = payload.get("project") or {}
    context = (
        f"Project: {proj.get('title', 'Untitled')}\n"
        f"Description: {proj.get('description', '')}\n"
        f"Problem: {proj.get('problem', '')}\n"
        f"Target users: {proj.get('target_users', '')}\n"
        f"Stage: {proj.get('startup_stage', '')}\n"
        f"Milestones: {', '.join(proj.get('milestones', []))}\n"
        f"Task completion: {proj.get('task_completion', 'unknown')}\n"
    )

    try:
        response = generate_ai_response(
            messages=[
                {"role": "system", "content": COACH_SYSTEM_PROMPT},
                {"role": "user", "content": f"{context}\nFounder question: {question}"},
            ],
            temperature=0.7,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI provider error: {exc}") from exc

    return {"success": True, "data": {"message": response}}


@router.post("/ai/milestones")
def ai_milestones_endpoint(payload: dict):
    idea = str(payload.get("idea") or payload.get("description") or "").strip()
    if not idea:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="idea is required")
    milestones = generate_milestones_from_idea(idea)
    return {"success": True, "data": {"milestones": milestones}}


@router.post("/ai/break-my-startup")
def break_my_startup_endpoint(payload: dict):
    """
    Expects payload:
      {
        "project": {
          "title": "...",
          "description": "...",
          "problem": "...",
          "target_users": "...",
          "startup_stage": "...",
          "validation_score": 40,
          "execution_score": 58
        }
      }
    Returns JSON analysis: verdict, kill_reasons, survive_reasons, brutal_advice, survival_probability.
    """
    proj = payload.get("project") or {}
    if not proj.get("title"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="project.title is required")

    context = (
        f"Project: {proj.get('title')}\n"
        f"Description: {proj.get('description', '')}\n"
        f"Problem: {proj.get('problem', '')}\n"
        f"Target users: {proj.get('target_users', '')}\n"
        f"Stage: {proj.get('startup_stage', 'unknown')}\n"
        f"Validation score: {proj.get('validation_score', 0)}/100\n"
        f"Execution score: {proj.get('execution_score', 0)}/100\n"
    )

    try:
        raw = generate_ai_response(
            messages=[
                {"role": "system", "content": BREAK_SYSTEM_PROMPT},
                {"role": "user", "content": f"Analyze this startup:\n{context}"},
            ],
            temperature=0.4,
        )
        # Strip markdown fences if present
        clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        data = json.loads(clean)
    except json.JSONDecodeError:
        # Return raw as verdict if JSON parse fails
        data = {
            "verdict": raw,
            "kill_reasons": [],
            "survive_reasons": [],
            "brutal_advice": "",
            "survival_probability": 50,
        }
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI provider error: {exc}") from exc

    return {"success": True, "data": data}
