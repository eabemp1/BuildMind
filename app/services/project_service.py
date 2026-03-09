"""Project and roadmap services."""

import json

from sqlalchemy.orm import Session, joinedload

from app.models import Project, Milestone, Task
from app.execution.roadmap import build_milestones_and_tasks
from app.services.profile_service import upsert_user_profile


def create_project(db: Session, user_id: int, title: str, description: str) -> Project:
    row = Project(user_id=user_id, title=title, description=description)
    db.add(row)
    db.flush()
    return row


def get_project_for_user(db: Session, user_id: int, project_id: int) -> Project | None:
    return (
        db.query(Project)
        .options(joinedload(Project.milestones).joinedload(Milestone.tasks))
        .filter(Project.id == project_id, Project.user_id == user_id)
        .first()
    )


def list_projects_for_user(db: Session, user_id: int) -> list[Project]:
    return (
        db.query(Project)
        .options(joinedload(Project.milestones).joinedload(Milestone.tasks))
        .filter(Project.user_id == user_id)
        .order_by(Project.created_at.desc())
        .all()
    )


def generate_project_roadmap(db: Session, user_id: int, project_id: int, goal_duration_weeks: int) -> Project:
    project = get_project_for_user(db, user_id, project_id)
    if not project:
        raise ValueError("Project not found")

    if project.milestones:
        # Deterministic behavior for v1: prevent duplicate milestone trees.
        return project

    milestones = build_milestones_and_tasks(project_id=project.id, goal_duration_weeks=goal_duration_weeks)
    for ms in milestones:
        db.add(ms)
    db.flush()
    return get_project_for_user(db, user_id, project_id)  # reload with relations


def _country_funding_opportunities(country: str) -> list[str]:
    key = str(country or "").strip().lower()
    mapping = {
        "ghana": [
            "Apply to MEST Africa programs",
            "Apply to Ghana Innovation Hub grants",
            "Pitch at local angel investor circles in Accra",
        ],
        "nigeria": [
            "Apply to CcHub startup support programs",
            "Apply to Tony Elumelu Foundation entrepreneurship funding",
            "Prepare outreach list for Lagos angel syndicates",
        ],
        "kenya": [
            "Apply to Nairobi innovation and accelerator programs",
            "Prepare pitch for East Africa angel investor networks",
            "Submit to regionally active startup grant calls",
        ],
        "south africa": [
            "Apply to SA startup incubator and seed programs",
            "Map local VC and angel funds for pre-seed outreach",
            "Prepare compliance checklist for local funding due diligence",
        ],
    }
    return mapping.get(
        key,
        [
            "Map 10 relevant grants for your market and stage",
            "Prepare investor outreach list for regional angel networks",
            "Apply to at least 2 accelerators active in emerging markets",
        ],
    )


def generate_agent_startup_roadmap(
    db: Session,
    user_id: int,
    idea_description: str,
    country: str,
    industry: str,
    stage: str,
) -> dict:
    clean_idea = str(idea_description or "").strip()
    clean_country = str(country or "").strip()
    clean_industry = str(industry or "").strip()
    clean_stage = str(stage or "").strip()

    validation_tasks = [
        f"Define target customer profile for {clean_industry} in {clean_country}",
        "Run 10 user discovery interviews and log top pain points",
        "Create problem-solution fit hypothesis and test assumptions",
        "Validate willingness-to-pay with at least 5 prospects",
    ]
    mvp_tasks = [
        f"Define MVP scope aligned to current stage: {clean_stage}",
        "Create product requirement checklist for core user flow",
        "Build MVP with one measurable success metric",
        "Launch MVP to first 20 test users and collect structured feedback",
    ]
    growth_tasks = [
        "Set weekly traction metrics dashboard (activation, retention, conversion)",
        "Run 2 acquisition experiments and measure CAC vs conversion",
        "Create founder pitch deck and data room baseline",
        *_country_funding_opportunities(clean_country),
    ]

    roadmap = [
        {"stage": "Validation", "tasks": validation_tasks},
        {"stage": "MVP", "tasks": mvp_tasks},
        {"stage": "Growth", "tasks": growth_tasks},
    ]

    title = f"{clean_industry} startup roadmap"
    project = Project(
        user_id=user_id,
        title=title[:255],
        description=clean_idea[:2000],
        roadmap_json=json.dumps(roadmap, ensure_ascii=False),
    )
    db.add(project)
    db.flush()

    upsert_user_profile(
        db,
        user_id=user_id,
        country=clean_country,
        startup_stage=clean_stage,
        industry=clean_industry,
    )

    for i, block in enumerate(roadmap, start=1):
        milestone = Milestone(
            project_id=project.id,
            title=block["stage"],
            week_number=i,
            is_completed=False,
        )
        db.add(milestone)
        db.flush()
        for task_text in block["tasks"]:
            db.add(Task(milestone_id=milestone.id, description=str(task_text), is_completed=False))

    db.flush()

    return {
        "project_id": project.id,
        "roadmap": roadmap,
    }



