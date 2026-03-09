"""Project and roadmap services."""

import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.models import Project, Milestone, Task
from app.execution.roadmap import build_milestones_and_tasks
from app.services.buildmind_service import create_activity, create_notification
from app.services.profile_service import upsert_user_profile


def create_project(
    db: Session,
    user_id: int,
    title: str,
    description: str,
    problem: str | None = None,
    target_users: str | None = None,
) -> Project:
    row = Project(
        user_id=user_id,
        title=title,
        description=description,
        problem=problem,
        target_users=target_users,
    )
    db.add(row)
    db.flush()
    create_activity(db, user_id=user_id, activity_type="project_created", reference_id=row.id)
    return row


def get_project_for_user(db: Session, user_id: int, project_id: int) -> Project | None:
    return (
        db.query(Project)
        .options(joinedload(Project.milestones).joinedload(Milestone.tasks))
        .filter(Project.id == project_id, Project.user_id == user_id, Project.is_archived.is_(False))
        .first()
    )


def list_projects_for_user(db: Session, user_id: int) -> list[Project]:
    return (
        db.query(Project)
        .options(joinedload(Project.milestones).joinedload(Milestone.tasks))
        .filter(Project.user_id == user_id, Project.is_archived.is_(False))
        .order_by(Project.created_at.desc())
        .all()
    )


def update_project_for_user(
    db: Session,
    user_id: int,
    project_id: int,
    title: str | None = None,
    description: str | None = None,
    problem: str | None = None,
    target_users: str | None = None,
    progress: float | None = None,
) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == user_id)
        .first()
    )
    if not project:
        raise ValueError("Project not found")
    if title is not None:
        project.title = title
    if description is not None:
        project.description = description
    if problem is not None:
        project.problem = problem
    if target_users is not None:
        project.target_users = target_users
    if progress is not None:
        project.progress = progress
    db.add(project)
    db.flush()
    return get_project_for_user(db, user_id=user_id, project_id=project_id)


def archive_project_for_user(db: Session, user_id: int, project_id: int) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == user_id)
        .first()
    )
    if not project:
        raise ValueError("Project not found")
    project.is_archived = True
    project.archived_at = datetime.now(timezone.utc)
    db.add(project)
    db.flush()
    return project


def delete_project_for_user(db: Session, user_id: int, project_id: int) -> None:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == user_id)
        .first()
    )
    if not project:
        raise ValueError("Project not found")
    db.delete(project)
    db.flush()


ROADMAP_STAGE_TEMPLATE = [
    ("Idea", ["Document startup thesis", "Define ideal customer profile", "Write success criteria"]),
    ("Validation", ["Interview 10 users", "Test pricing assumptions", "Summarize validated pain points"]),
    ("Prototype", ["Build clickable prototype", "Run usability tests", "Capture UX feedback"]),
    ("MVP", ["Prioritize core features", "Build landing page", "Ship MVP to test group"]),
    ("First Users", ["Onboard first 20 users", "Measure retention baseline", "Implement activation improvements"]),
    ("Revenue", ["Run monetization experiment", "Close first paying customers", "Track MRR and churn"]),
]


def _llm_generate_tasks_for_stage(project: Project, stage_title: str) -> list[str]:
    # Placeholder deterministic generator for MVP; can be replaced with external LLM call.
    stage_map = {title: tasks for title, tasks in ROADMAP_STAGE_TEMPLATE}
    tasks = stage_map.get(stage_title, [])
    if not tasks:
        return [
            f"Define deliverables for {stage_title}",
            "Execute top 3 priorities",
            "Review outcomes and iterate",
        ]
    if project.problem:
        tasks = [f"{task} ({project.problem[:40]})" if i == 0 else task for i, task in enumerate(tasks)]
    return tasks


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


def generate_project_stage_roadmap(db: Session, user_id: int, project_id: int) -> Project:
    project = get_project_for_user(db, user_id=user_id, project_id=project_id)
    if not project:
        raise ValueError("Project not found")

    if project.milestones:
        return project

    roadmap_payload = []
    for index, (stage_title, _) in enumerate(ROADMAP_STAGE_TEMPLATE):
        tasks = _llm_generate_tasks_for_stage(project, stage_title)
        milestone = Milestone(
            project_id=project.id,
            title=stage_title,
            status="pending",
            order_index=index,
            week_number=index + 1,
            is_completed=False,
        )
        db.add(milestone)
        db.flush()
        for task_text in tasks:
            task = Task(
                milestone_id=milestone.id,
                title=task_text,
                description=task_text,
                status="todo",
                priority="medium",
                is_completed=False,
            )
            db.add(task)
        roadmap_payload.append({"stage": stage_title, "tasks": tasks})

    project.roadmap_json = json.dumps(roadmap_payload, ensure_ascii=False)
    db.add(project)
    db.flush()
    create_activity(db, user_id=user_id, activity_type="roadmap_generated", reference_id=project.id)
    return get_project_for_user(db, user_id=user_id, project_id=project.id)


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
            status="pending",
            order_index=i - 1,
            week_number=i,
            is_completed=False,
        )
        db.add(milestone)
        db.flush()
        for task_text in block["tasks"]:
            db.add(
                Task(
                    milestone_id=milestone.id,
                    title=str(task_text),
                    description=str(task_text),
                    status="todo",
                    priority="medium",
                    is_completed=False,
                )
            )

    db.flush()
    create_activity(db, user_id=user_id, activity_type="project_created", reference_id=project.id)
    create_notification(
        db,
        user_id=user_id,
        notification_type="roadmap_generated",
        message=f"Roadmap generated for {project.title}",
        reference_id=project.id,
    )

    return {
        "project_id": project.id,
        "roadmap": roadmap,
    }



