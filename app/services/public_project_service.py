from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models import Milestone, Project, ProjectComment, ProjectUpdate, Task, User


def list_public_projects(db: Session) -> list[dict]:
    rows = (
        db.query(Project)
        .options(joinedload(Project.milestones))
        .join(User, Project.user_id == User.id)
        .filter(Project.is_public.is_(True), Project.is_archived.is_(False))
        .order_by(Project.created_at.desc())
        .all()
    )
    output = []
    for project in rows:
        milestones_total = len(project.milestones)
        milestones_completed = len([m for m in project.milestones if m.is_completed])
        founder = project.user
        founder_name = founder.username or (founder.email.split("@")[0] if founder.email else "Founder")
        output.append(
            {
                "id": project.id,
                "title": project.title,
                "description": project.description,
                "progress": project.progress,
                "milestones_completed": milestones_completed,
                "milestones_total": milestones_total,
                "likes": project.likes,
                "followers": project.followers,
                "is_public": project.is_public,
                "founder_name": founder_name,
                "founder_username": founder.username,
                "created_at": project.created_at,
            }
        )
    return output


def get_public_project(db: Session, project_id: int) -> dict | None:
    project = (
        db.query(Project)
        .options(joinedload(Project.milestones).joinedload(Milestone.tasks))
        .join(User, Project.user_id == User.id)
        .filter(Project.id == project_id, Project.is_public.is_(True))
        .first()
    )
    if not project:
        return None
    updates = (
        db.query(ProjectUpdate)
        .filter(ProjectUpdate.project_id == project_id)
        .order_by(ProjectUpdate.created_at.desc())
        .all()
    )
    comments = (
        db.query(ProjectComment)
        .filter(ProjectComment.project_id == project_id)
        .order_by(ProjectComment.created_at.desc())
        .all()
    )
    founder = project.user
    founder_name = founder.username or (founder.email.split("@")[0] if founder.email else "Founder")
    milestones_payload = []
    for ms in sorted(project.milestones, key=lambda x: (x.order_index, x.id)):
        milestones_payload.append(
            {
                "id": ms.id,
                "title": ms.title,
                "status": ms.status,
                "is_completed": ms.is_completed,
                "tasks": [
                    {"id": t.id, "title": t.title or t.description, "is_completed": t.is_completed}
                    for t in sorted(ms.tasks, key=lambda x: x.id)
                ],
            }
        )
    return {
        "id": project.id,
        "title": project.title,
        "description": project.description,
        "problem": project.problem,
        "target_users": project.target_users,
        "progress": project.progress,
        "likes": project.likes,
        "followers": project.followers,
        "is_public": project.is_public,
        "founder_name": founder_name,
        "founder_username": founder.username,
        "created_at": project.created_at,
        "milestones": milestones_payload,
        "updates": [
            {
                "id": update.id,
                "project_id": update.project_id,
                "user_id": update.user_id,
                "content": update.content,
                "created_at": update.created_at,
            }
            for update in updates
        ],
        "comments": [
            {
                "id": comment.id,
                "project_id": comment.project_id,
                "author_name": comment.author_name,
                "content": comment.content,
                "created_at": comment.created_at,
            }
            for comment in comments
        ],
    }


def add_project_update(db: Session, user_id: int, project_id: int, content: str) -> ProjectUpdate:
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id).first()
    if not project:
        raise ValueError("Project not found")
    update = ProjectUpdate(project_id=project_id, user_id=user_id, content=content)
    db.add(update)
    db.flush()
    return update


def add_project_comment(db: Session, project_id: int, author_name: str | None, content: str) -> ProjectComment:
    project = db.query(Project).filter(Project.id == project_id, Project.is_public.is_(True)).first()
    if not project:
        raise ValueError("Project not found")
    comment = ProjectComment(project_id=project_id, author_name=author_name, content=content)
    db.add(comment)
    db.flush()
    return comment


def like_project(db: Session, project_id: int) -> Project:
    project = db.query(Project).filter(Project.id == project_id, Project.is_public.is_(True)).first()
    if not project:
        raise ValueError("Project not found")
    project.likes = int(project.likes or 0) + 1
    db.add(project)
    db.flush()
    return project


def follow_project(db: Session, project_id: int) -> Project:
    project = db.query(Project).filter(Project.id == project_id, Project.is_public.is_(True)).first()
    if not project:
        raise ValueError("Project not found")
    project.followers = int(project.followers or 0) + 1
    db.add(project)
    owner = db.query(User).filter(User.id == project.user_id).first()
    if owner:
        owner.followers = int(owner.followers or 0) + 1
        db.add(owner)
    db.flush()
    return project


def get_founder_profile(db: Session, username: str) -> dict | None:
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return None

    projects = (
        db.query(Project)
        .options(joinedload(Project.milestones))
        .filter(Project.user_id == user.id, Project.is_public.is_(True))
        .order_by(Project.created_at.desc())
        .all()
    )

    updates = (
        db.query(ProjectUpdate)
        .join(Project, ProjectUpdate.project_id == Project.id)
        .filter(Project.user_id == user.id)
        .order_by(ProjectUpdate.created_at.desc())
        .limit(5)
        .all()
    )

    project_payload = []
    for project in projects:
        milestones_total = len(project.milestones)
        milestones_completed = len([m for m in project.milestones if m.is_completed])
        project_payload.append(
            {
                "id": project.id,
                "title": project.title,
                "description": project.description,
                "progress": project.progress,
                "milestones_completed": milestones_completed,
                "milestones_total": milestones_total,
                "likes": project.likes,
                "followers": project.followers,
                "is_public": project.is_public,
                "founder_name": user.username or (user.email.split("@")[0] if user.email else "Founder"),
                "founder_username": user.username,
                "created_at": project.created_at,
            }
        )

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "bio": user.bio,
        "avatar_url": user.avatar_url,
        "followers": user.followers,
        "projects": project_payload,
        "recent_updates": [
            {
                "id": update.id,
                "project_id": update.project_id,
                "user_id": update.user_id,
                "content": update.content,
                "created_at": update.created_at,
            }
            for update in updates
        ],
    }


def search_global(db: Session, query: str) -> dict:
    like = f"%{query.lower()}%"
    projects = (
        db.query(Project.id, Project.title)
        .filter(func.lower(Project.title).like(like))
        .order_by(Project.title.asc())
        .limit(5)
        .all()
    )
    milestones = (
        db.query(Milestone.id, Milestone.title, Milestone.project_id)
        .filter(func.lower(Milestone.title).like(like))
        .order_by(Milestone.title.asc())
        .limit(5)
        .all()
    )
    tasks = (
        db.query(Task.id, Task.title, Milestone.project_id)
        .join(Milestone, Task.milestone_id == Milestone.id)
        .filter(func.lower(Task.title).like(like))
        .order_by(Task.title.asc())
        .limit(5)
        .all()
    )
    return {
        "projects": [{"id": row.id, "title": row.title} for row in projects],
        "milestones": [{"id": row.id, "title": row.title, "project_id": row.project_id} for row in milestones],
        "tasks": [{"id": row.id, "title": row.title, "project_id": row.project_id} for row in tasks],
    }


def upsert_public_project(
    db: Session,
    user_email: str,
    username: str | None,
    bio: str | None,
    avatar_url: str | None,
    title: str,
    description: str | None,
    progress: float | None,
) -> Project:
    email = (user_email or "").strip().lower()
    if not email:
        raise ValueError("User email is required")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, username=username)
        user.bio = bio
        user.avatar_url = avatar_url
        db.add(user)
        db.flush()
    else:
        if username and not user.username:
            user.username = username
        if bio:
            user.bio = bio
        if avatar_url:
            user.avatar_url = avatar_url
        db.add(user)

    project = (
        db.query(Project)
        .filter(Project.user_id == user.id, Project.title == title)
        .first()
    )
    if not project:
        project = Project(
            user_id=user.id,
            title=title,
            description=description,
            progress=progress or 0,
            is_public=True,
        )
        db.add(project)
        db.flush()
        return project

    project.description = description or project.description
    project.progress = float(progress or project.progress or 0)
    project.is_public = True
    db.add(project)
    db.flush()
    return project
