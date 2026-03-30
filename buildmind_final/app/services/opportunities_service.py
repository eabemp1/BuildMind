import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import UserProfile


BASE_DIR = Path(__file__).resolve().parents[2]
OPPORTUNITIES_FILE = BASE_DIR / "datasets" / "opportunities.json"


def _load_opportunities() -> list[dict]:
    try:
        raw = json.loads(OPPORTUNITIES_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        if isinstance(item, dict):
            out.append(
                {
                    "name": str(item.get("name", "")).strip(),
                    "type": str(item.get("type", "")).strip(),
                    "region": str(item.get("region", "")).strip(),
                    "eligibility": str(item.get("eligibility", "")).strip(),
                    "deadline": str(item.get("deadline", "")).strip(),
                    "link": str(item.get("link", "")).strip(),
                }
            )
    return out


def _score_opportunity(item: dict, country: str, stage: str, industry: str) -> float:
    score = 0.0
    region = str(item.get("region", "")).lower()
    eligibility = str(item.get("eligibility", "")).lower()

    c = str(country or "").strip().lower()
    s = str(stage or "").strip().lower()
    i = str(industry or "").strip().lower()

    if c and (c in region or c in eligibility):
        score += 3.0
    if c and "africa" in region:
        score += 1.0
    if s and s in eligibility:
        score += 2.0
    if i and (i in eligibility or i in str(item.get("name", "")).lower()):
        score += 2.0
    if "grant" in str(item.get("type", "")).lower():
        score += 0.4
    return score


def get_recommended_opportunities(db: Session, user_id: int, limit: int = 5) -> dict:
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    country = profile.country if profile else ""
    stage = profile.startup_stage if profile else ""
    industry = profile.industry if profile else ""

    opportunities = _load_opportunities()
    scored = []
    for item in opportunities:
        score = _score_opportunity(item, country=country, stage=stage, industry=industry)
        scored.append((score, item))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = [item for _, item in scored[: max(1, min(20, int(limit)))]]

    return {
        "profile": {
            "country": country,
            "startup_stage": stage,
            "industry": industry,
        },
        "matches": top,
    }
