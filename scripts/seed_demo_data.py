"""Seed BuildMind demo data into the configured database.

Usage:
    py scripts/seed_demo_data.py
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.models import Feedback, Milestone, NewsletterSubscriber, Project, Task, User


DEMO_PASSWORD = "DemoPass123!"
MILESTONE_TITLES = ["Idea", "Validation", "Prototype", "MVP", "First Users", "Revenue"]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_runtime_schema() -> None:
    inspector = inspect(engine)
    table_columns: dict[str, set[str]] = {}
    for table_name in ["users", "projects", "milestones", "tasks", "feedback"]:
        try:
            table_columns[table_name] = {col["name"] for col in inspector.get_columns(table_name)}
        except Exception:
            table_columns[table_name] = set()

    alter_map = {
        "users": [
            ("username", "ALTER TABLE users ADD COLUMN username VARCHAR(100)"),
            ("password_hash", "ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)"),
            ("bio", "ALTER TABLE users ADD COLUMN bio TEXT"),
            ("avatar_url", "ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500)"),
            ("onboarding_completed", "ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT 0"),
            ("is_active", "ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"),
            ("is_admin", "ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0"),
        ],
        "projects": [
            ("problem", "ALTER TABLE projects ADD COLUMN problem TEXT"),
            ("target_users", "ALTER TABLE projects ADD COLUMN target_users TEXT"),
            ("progress", "ALTER TABLE projects ADD COLUMN progress FLOAT DEFAULT 0"),
            ("roadmap_json", "ALTER TABLE projects ADD COLUMN roadmap_json TEXT"),
            ("is_archived", "ALTER TABLE projects ADD COLUMN is_archived BOOLEAN DEFAULT 0"),
            ("archived_at", "ALTER TABLE projects ADD COLUMN archived_at TIMESTAMP"),
        ],
        "milestones": [
            ("status", "ALTER TABLE milestones ADD COLUMN status VARCHAR(32) DEFAULT 'pending'"),
            ("order_index", "ALTER TABLE milestones ADD COLUMN order_index INTEGER DEFAULT 0"),
            ("completed_at", "ALTER TABLE milestones ADD COLUMN completed_at TIMESTAMP"),
        ],
        "tasks": [
            ("title", "ALTER TABLE tasks ADD COLUMN title VARCHAR(255)"),
            ("status", "ALTER TABLE tasks ADD COLUMN status VARCHAR(32) DEFAULT 'todo'"),
            ("priority", "ALTER TABLE tasks ADD COLUMN priority VARCHAR(16) DEFAULT 'medium'"),
            ("due_date", "ALTER TABLE tasks ADD COLUMN due_date TIMESTAMP"),
        ],
        "feedback": [
            ("project_id", "ALTER TABLE feedback ADD COLUMN project_id INTEGER"),
            ("rating", "ALTER TABLE feedback ADD COLUMN rating INTEGER"),
            ("category", "ALTER TABLE feedback ADD COLUMN category VARCHAR(32)"),
            ("comment", "ALTER TABLE feedback ADD COLUMN comment TEXT"),
        ],
    }

    with engine.begin() as conn:
        for table_name, alters in alter_map.items():
            existing = table_columns.get(table_name, set())
            for column_name, alter_sql in alters:
                if column_name not in existing:
                    conn.execute(text(alter_sql))


def _task_templates(project_title: str) -> dict[str, list[str]]:
    return {
        "Idea": [
            f"Define core value proposition for {project_title}",
            "Document target market assumptions",
            "Set success criteria for validation",
        ],
        "Validation": [
            "Interview 10 potential users",
            "Run problem interview synthesis",
            "Validate willingness to pay",
        ],
        "Prototype": [
            "Create clickable prototype",
            "Run 5 usability sessions",
            "Capture top UX improvements",
        ],
        "MVP": [
            "Build landing page",
            "Ship MVP core workflow",
            "Track activation funnel",
        ],
        "First Users": [
            "Onboard first 20 users",
            "Collect feedback from first cohort",
            "Improve onboarding flow",
        ],
        "Revenue": [
            "Test pricing page",
            "Close first 3 paying users",
            "Review monthly recurring revenue baseline",
        ],
    }


def _feedback_comments(project_title: str) -> list[dict]:
    return [
        {
            "rating": 4,
            "category": "product",
            "comment": f"Strong concept for {project_title}; onboarding flow is clear.",
            "feedback_type": "positive",
        },
        {
            "rating": 3,
            "category": "UX",
            "comment": "Navigation needs simplification before broader launch.",
            "feedback_type": "negative",
        },
        {
            "rating": 5,
            "category": "growth",
            "comment": "Great early traction signals from first-user interviews.",
            "feedback_type": "positive",
        },
    ]


def upsert_user(db: Session, username: str, email: str, bio: str, avatar_url: str, is_admin: bool = False) -> User:
    user = db.query(User).filter(User.email == email.lower()).first()
    hashed = hash_password(DEMO_PASSWORD)
    if user is None:
        user = User(
            username=username.lower(),
            email=email.lower(),
            hashed_password=hashed,
            password_hash=hashed,
            bio=bio,
            avatar_url=avatar_url,
            onboarding_completed=True,
            is_active=True,
            is_admin=is_admin,
        )
        db.add(user)
        db.flush()
    else:
        user.username = username.lower()
        user.hashed_password = hashed
        user.password_hash = hashed
        user.bio = bio
        user.avatar_url = avatar_url
        user.onboarding_completed = True
        user.is_active = True
        user.is_admin = is_admin
        db.add(user)
        db.flush()

    subscriber = db.query(NewsletterSubscriber).filter(NewsletterSubscriber.email == user.email).first()
    if subscriber is None:
        db.add(NewsletterSubscriber(email=user.email, subscribed=True))
    else:
        subscriber.subscribed = True
        db.add(subscriber)
    db.flush()
    return user


def clear_project_children(db: Session, project: Project) -> None:
    feedback_rows = db.query(Feedback).filter(Feedback.project_id == project.id).all()
    for row in feedback_rows:
        db.delete(row)

    milestone_rows = (
        db.query(Milestone)
        .filter(Milestone.project_id == project.id)
        .order_by(Milestone.order_index.asc(), Milestone.id.asc())
        .all()
    )
    for milestone in milestone_rows:
        db.delete(milestone)

    db.flush()


def upsert_project(
    db: Session,
    owner: User,
    title: str,
    description: str,
    problem: str,
    target_users: str,
) -> Project:
    project = (
        db.query(Project)
        .filter(Project.user_id == owner.id, Project.title == title)
        .first()
    )
    if project is None:
        project = Project(
            user_id=owner.id,
            title=title,
            description=description,
            problem=problem,
            target_users=target_users,
            progress=0.0,
            is_archived=False,
        )
        db.add(project)
        db.flush()
    else:
        project.description = description
        project.problem = problem
        project.target_users = target_users
        project.progress = 0.0
        project.is_archived = False
        project.archived_at = None
        db.add(project)
        db.flush()
        clear_project_children(db, project)
    return project


def seed_milestones_and_tasks(db: Session, project: Project) -> list[Task]:
    task_templates = _task_templates(project.title)
    all_tasks: list[Task] = []
    now = utcnow()

    for idx, milestone_title in enumerate(MILESTONE_TITLES):
        is_done = idx < 2
        milestone = Milestone(
            project_id=project.id,
            title=milestone_title,
            status="completed" if is_done else ("in_progress" if idx == 2 else "pending"),
            order_index=idx,
            week_number=idx + 1,
            is_completed=is_done,
            completed_at=(now - timedelta(days=14 - (idx * 2))) if is_done else None,
        )
        db.add(milestone)
        db.flush()

        for t_idx, task_title in enumerate(task_templates[milestone_title]):
            task_done = is_done or (idx == 2 and t_idx == 0)
            task = Task(
                milestone_id=milestone.id,
                title=task_title,
                description=task_title,
                status="completed" if task_done else "todo",
                priority="high" if t_idx == 0 else ("medium" if t_idx == 1 else "low"),
                due_date=now + timedelta(days=(idx * 5 + t_idx)),
                is_completed=task_done,
                completed_at=(now - timedelta(days=10 - idx)) if task_done else None,
            )
            db.add(task)
            all_tasks.append(task)
    db.flush()

    completed_milestones = db.query(Milestone).filter(
        Milestone.project_id == project.id,
        Milestone.is_completed.is_(True),
    ).count()
    total_milestones = db.query(Milestone).filter(Milestone.project_id == project.id).count()
    project.progress = round((completed_milestones / max(1, total_milestones)) * 100, 2)
    db.add(project)
    db.flush()
    return all_tasks


def seed_feedback(db: Session, project: Project, author_pool: list[User], project_tasks: list[Task]) -> int:
    comments = _feedback_comments(project.title)
    count = 0
    for idx, payload in enumerate(comments):
        author = author_pool[idx % len(author_pool)]
        task = project_tasks[idx % len(project_tasks)] if project_tasks else None
        row = Feedback(
            user_id=author.id,
            project_id=project.id,
            task_id=(task.id if task else None),
            feedback_type=payload["feedback_type"],
            rating=payload["rating"],
            category=payload["category"],
            comment=payload["comment"],
            created_at=utcnow() - timedelta(days=(2 - idx)),
        )
        db.add(row)
        count += 1
    db.flush()
    return count


def main() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_runtime_schema()
    db = SessionLocal()
    try:
        users_data = [
            {
                "username": "ada_founder",
                "email": "ada@buildmind.demo",
                "bio": "AI product founder focused on education tooling.",
                "avatar_url": "https://api.dicebear.com/9.x/lorelei/svg?seed=Ada",
                "is_admin": True,
            },
            {
                "username": "kwame_builder",
                "email": "kwame@buildmind.demo",
                "bio": "Operator building B2C marketplaces for students.",
                "avatar_url": "https://api.dicebear.com/9.x/lorelei/svg?seed=Kwame",
                "is_admin": False,
            },
            {
                "username": "nora_hustle",
                "email": "nora@buildmind.demo",
                "bio": "Solo founder shipping AI workflows for freelancers.",
                "avatar_url": "https://api.dicebear.com/9.x/lorelei/svg?seed=Nora",
                "is_admin": False,
            },
            {
                "username": "sam_validate",
                "email": "sam@buildmind.demo",
                "bio": "Validation-first founder testing startup demand signals.",
                "avatar_url": "https://api.dicebear.com/9.x/lorelei/svg?seed=Sam",
                "is_admin": False,
            },
            {
                "username": "lee_habits",
                "email": "lee@buildmind.demo",
                "bio": "Mobile product lead focused on behavior change apps.",
                "avatar_url": "https://api.dicebear.com/9.x/lorelei/svg?seed=Lee",
                "is_admin": False,
            },
        ]

        users = [
            upsert_user(
                db,
                username=item["username"],
                email=item["email"],
                bio=item["bio"],
                avatar_url=item["avatar_url"],
                is_admin=item["is_admin"],
            )
            for item in users_data
        ]

        projects_data = [
            {
                "title": "AI Study Planner",
                "description": "An AI-powered planner helping students optimize study schedules.",
                "problem": "Students struggle to plan revision effectively across multiple courses.",
                "target_users": "University and senior high school students preparing for exams.",
                "owner": users[0],
            },
            {
                "title": "Campus Marketplace",
                "description": "A trusted buy/sell marketplace for campus communities.",
                "problem": "Students lack a safe and organized local marketplace for goods and services.",
                "target_users": "College students and campus entrepreneurs.",
                "owner": users[1],
            },
            {
                "title": "Freelancer AI Assistant",
                "description": "AI assistant for proposals, client communication, and delivery tracking.",
                "problem": "Freelancers spend too much time on admin and client follow-ups.",
                "target_users": "Independent designers, developers, and marketers.",
                "owner": users[2],
            },
            {
                "title": "Startup Idea Validator",
                "description": "A toolkit to validate startup ideas with structured user research.",
                "problem": "Founders launch too early without evidence of real customer demand.",
                "target_users": "Early-stage founders and innovation teams.",
                "owner": users[3],
            },
            {
                "title": "Habit Builder App",
                "description": "Mobile habit tracker with accountability and streak mechanics.",
                "problem": "People start habits but fail to sustain consistency.",
                "target_users": "Young professionals and students focused on personal growth.",
                "owner": users[4],
            },
        ]

        project_count = 0
        milestone_count = 0
        task_count = 0
        feedback_count = 0

        for item in projects_data:
            project = upsert_project(
                db,
                owner=item["owner"],
                title=item["title"],
                description=item["description"],
                problem=item["problem"],
                target_users=item["target_users"],
            )
            project_count += 1

            tasks = seed_milestones_and_tasks(db, project)
            milestone_count += len(MILESTONE_TITLES)
            task_count += len(tasks)

            feedback_count += seed_feedback(db, project, author_pool=users, project_tasks=tasks)

        db.commit()

        print("BuildMind demo data seeded successfully.")
        print(f"Demo users: {len(users)}")
        print(f"Demo projects: {project_count}")
        print(f"Milestones: {milestone_count}")
        print(f"Tasks: {task_count}")
        print(f"Feedback comments: {feedback_count}")
        print(f"Demo login password for all users: {DEMO_PASSWORD}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
