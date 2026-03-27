"""
Break My Startup route with web search.
Browses the internet for similar startups, analyzes what they're doing better,
calculates success probability comparison, and lists top 3 failure modes.
"""

import json
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import Project, User
from app.services.ai_service import generate_ai_response

router = APIRouter(tags=["break"])

# ─────────────────────────────────────────────
# Web search helper
# ─────────────────────────────────────────────

async def _web_search(query: str, max_results: int = 5) -> list[dict]:
    """
    Uses DuckDuckGo instant answer API for competitor research.
    Falls back to empty list if unavailable.
    No API key required.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_redirect": 1, "no_html": 1, "skip_disambig": 1},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            results = []
            for topic in data.get("RelatedTopics", [])[:max_results]:
                if isinstance(topic, dict) and topic.get("Text"):
                    results.append({
                        "title": topic.get("Text", "")[:200],
                        "url": topic.get("FirstURL", ""),
                    })
            return results
    except Exception:
        return []


# ─────────────────────────────────────────────
# Founder memory builder (simplified)
# ─────────────────────────────────────────────

def _build_context(db: Session, user: User, project: Project | None) -> dict:
    if not project:
        return {"founder": user.username or user.email.split("@")[0], "project": None}
    from app.models import Milestone, Task, StartupMetrics, ValidationData
    milestones = project.milestones or []
    all_tasks = [t for m in milestones for t in (m.tasks or [])]
    completed = [t for t in all_tasks if t.is_completed or t.status == "completed"]
    execution_score = round((len(completed) / max(1, len(all_tasks))) * 100)
    now = datetime.now(timezone.utc)
    days_in_stage = max(0, (now - (project.updated_at or project.created_at or now)).days)
    validation = db.query(ValidationData).filter(ValidationData.project_id == project.id).first()
    metrics = db.query(StartupMetrics).filter(StartupMetrics.project_id == project.id).first()
    return {
        "founder": user.username or user.email.split("@")[0],
        "project": {
            "title": project.title,
            "description": project.description or "",
            "problem": project.problem or "",
            "target_users": project.target_users or "",
            "stage": project.startup_stage or "MVP",
            "days_in_stage": days_in_stage,
        },
        "execution": {
            "score": execution_score,
            "total_tasks": len(all_tasks),
            "completed_tasks": len(completed),
        },
        "validation": {
            "users_interviewed": validation.users_interviewed if validation else 0,
        },
    }


# ─────────────────────────────────────────────
# Break My Startup endpoint
# ─────────────────────────────────────────────

@router.post("/ai/break-my-startup")
async def break_my_startup_endpoint(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Break My Startup with web search.
    1. Builds founder context from real database data
    2. Searches web for similar products and competitor data
    3. Generates honest failure analysis with competitor comparison
    4. Returns structured JSON with failure modes + competitor rankings
    """
    project = None
    try:
        project_id = int(payload.get("projectId", 0))
    except Exception:
        project_id = 0

    if project_id:
        project = db.query(Project).filter(
            Project.id == project_id,
            Project.user_id == current_user.id,
        ).first()
    else:
        project = (
            db.query(Project)
            .filter(Project.user_id == current_user.id, Project.is_archived.is_(False))
            .order_by(Project.updated_at.desc())
            .first()
        )

    context = _build_context(db, current_user, project)
    project_title = context.get("project", {}).get("title", "founder execution tool") if context.get("project") else "founder execution tool"
    project_problem = context.get("project", {}).get("problem", "startup execution") if context.get("project") else "startup execution"

    # Web search for competitors
    search_queries = [
        f"startup tools similar to {project_title} founder accountability",
        f"founder execution tools alternatives {project_problem}",
        f"startup accountability software success rate 2024",
    ]

    search_results = []
    for query in search_queries:
        results = await _web_search(query, max_results=4)
        search_results.extend(results)

    search_context = "\n".join(
        f"- {r['title']}" for r in search_results[:12] if r.get("title")
    ) or "No direct web results found — use general startup ecosystem knowledge."

    system_prompt = """You are BuildMind operating in Break My Startup mode.
Your job is to be the most honest voice this founder has ever heard.
No encouragement. No balance. Only the uncomfortable truths they need to hear.
Return ONLY valid JSON matching this exact schema — no preamble, no markdown:
{
  "failureReasons": [
    {
      "num": 1,
      "title": "string — max 10 words",
      "body": "string — 2-4 sentences, specific to their data",
      "evidence": "string — cite a real source or data point"
    }
  ],
  "competitors": [
    {
      "name": "string",
      "description": "string — one sentence",
      "betterAt": ["string", "string", "string", "string"],
      "successRate": 75,
      "yourSuccessRate": 45,
      "source": "string"
    }
  ],
  "yourMoat": "string — one paragraph on where this founder has an edge",
  "closingStatement": "string — one brutal honest sentence"
}"""

    user_prompt = f"""Founder context:
{json.dumps(context, ensure_ascii=False, default=str)}

Web search results for similar products:
{search_context}

Generate the Break My Startup analysis. Be specific. Reference their actual data.
Include 3 real or plausible competitor products with honest success rate comparisons.
The success rates should be realistic — don't make the founder look better than they are."""

    try:
        raw = generate_ai_response(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.6,
            max_tokens=1400,
        )
        # Strip markdown fences if present
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        analysis = json.loads(clean.strip())
    except json.JSONDecodeError:
        # Fallback: return raw text in a safe structure
        analysis = {
            "failureReasons": [{"num": 1, "title": "Analysis generation failed", "body": raw[:400], "evidence": "BuildMind AI"}],
            "competitors": [],
            "yourMoat": "Try running the analysis again.",
            "closingStatement": "Something went wrong. Run it again.",
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI provider error: {exc}",
        ) from exc

    return {
        "success": True,
        "data": {
            "analysis": analysis,
            "webSearchUsed": bool(search_results),
            "searchResultCount": len(search_results),
            "projectContext": context,
        },
    }
