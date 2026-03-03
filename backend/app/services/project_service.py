"""Project and roadmap services."""

from sqlalchemy.orm import Session, joinedload

from backend.app.models import Project, Milestone
from backend.app.execution.roadmap import build_milestones_and_tasks


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


