"""Unified EvolvAI OS backend application.

Single FastAPI app that combines:
- agent/adaptive capabilities
- execution tracking capabilities
"""

import logging
import os
import time

from fastapi import HTTPException
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute
from fastapi.responses import JSONResponse
from sqlalchemy import inspect as sa_inspect, text
from sqlalchemy.exc import SQLAlchemyError

from app.agent.runtime import *  # noqa: F401,F403
from app.database import Base, engine
from app.routes.auth import router as auth_router
from app.routes.projects import router as projects_router
from app.routes.tasks import router as tasks_router
from app.routes.feedback import router as feedback_router
from app.routes.dashboard import router as dashboard_router
from app.routes.activity import router as activity_router
from app.routes.notifications import router as notifications_router
from app.routes.newsletter import router as newsletter_router
from app.routes.admin import router as admin_router
from app.routes.scoring import router as scoring_router
from app.routes.report import router as report_router
from app.routes.reminder import router as reminder_router
from app.routes.opportunities import router as opportunities_router
from app.routes.founders import router as founders_router
from app.routes.search import router as search_router
from app.routes.ai import router as ai_router
from app.routes.weekly_reports import router as weekly_reports_router
from app.core.config import get_settings
from app.core.logging_config import configure_logging, request_log_line
from app.database import SessionLocal
from app.services.weekly_report_service import generate_weekly_reports_for_all_users

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger


Base.metadata.create_all(bind=engine)


def _ensure_runtime_schema() -> None:
    inspector = sa_inspect(engine)
    table_columns = {}
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
            ("followers", "ALTER TABLE users ADD COLUMN followers INTEGER DEFAULT 0"),
            ("onboarding_completed", "ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT 0"),
            ("is_active", "ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"),
            ("is_admin", "ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0"),
        ],
        "projects": [
            ("roadmap_json", "ALTER TABLE projects ADD COLUMN roadmap_json TEXT"),
            ("problem", "ALTER TABLE projects ADD COLUMN problem TEXT"),
            ("target_users", "ALTER TABLE projects ADD COLUMN target_users TEXT"),
            ("progress", "ALTER TABLE projects ADD COLUMN progress FLOAT DEFAULT 0"),
            ("is_public", "ALTER TABLE projects ADD COLUMN is_public BOOLEAN DEFAULT 0"),
            ("likes", "ALTER TABLE projects ADD COLUMN likes INTEGER DEFAULT 0"),
            ("followers", "ALTER TABLE projects ADD COLUMN followers INTEGER DEFAULT 0"),
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

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS project_updates (
                    id INTEGER PRIMARY KEY,
                    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS weekly_reports (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    week_start_date TIMESTAMP NOT NULL,
                    projects_count INTEGER DEFAULT 0,
                    milestones_completed INTEGER DEFAULT 0,
                    tasks_completed INTEGER DEFAULT 0,
                    ai_summary TEXT,
                    ai_risks TEXT,
                    ai_suggestions TEXT,
                    created_at TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS project_comments (
                    id INTEGER PRIMARY KEY,
                    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    author_name VARCHAR(120),
                    content TEXT NOT NULL,
                    created_at TIMESTAMP
                )
                """
            )
        )


_ensure_runtime_schema()

app.title = "EvolvAI OS"
configure_logging()
logger = logging.getLogger("evolvai")
settings = get_settings()
_scheduler: BackgroundScheduler | None = None

frontend_origins = [o.strip() for o in settings.FRONTEND_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(projects_router, prefix="/api/v1")
app.include_router(tasks_router, prefix="/api/v1")
app.include_router(feedback_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(activity_router, prefix="/api/v1")
app.include_router(notifications_router, prefix="/api/v1")
app.include_router(newsletter_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(scoring_router, prefix="/api/v1")
app.include_router(report_router, prefix="/api/v1")
app.include_router(reminder_router, prefix="/api/v1")
app.include_router(opportunities_router, prefix="/api/v1")
app.include_router(founders_router, prefix="/api/v1")
app.include_router(search_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")
app.include_router(weekly_reports_router, prefix="/api/v1")


def _install_v1_aliases() -> None:
    """Expose /api/v1 aliases for legacy non-versioned routes (mainly agent/runtime routes)."""
    skip_prefixes = {"/api/v1", "/docs", "/redoc", "/openapi.json", "/static", "/health"}
    snapshot = list(app.routes)
    existing = set()
    for route in snapshot:
        if not isinstance(route, APIRoute):
            continue
        methods = tuple(sorted(m for m in (route.methods or set()) if m not in {"HEAD", "OPTIONS"}))
        existing.add((route.path, methods))

    for route in snapshot:
        if not isinstance(route, APIRoute):
            continue
        if any(route.path.startswith(prefix) for prefix in skip_prefixes):
            continue
        methods = sorted(m for m in (route.methods or set()) if m not in {"HEAD", "OPTIONS"})
        if not methods:
            continue
        alias_path = "/api/v1" if route.path == "/" else f"/api/v1{route.path}"
        key = (alias_path, tuple(sorted(methods)))
        if key in existing:
            continue
        app.add_api_route(
            path=alias_path,
            endpoint=route.endpoint,
            methods=methods,
            include_in_schema=False,
            name=f"{route.name}_v1",
        )
        existing.add(key)


_install_v1_aliases()


def _run_weekly_reports() -> None:
    db = SessionLocal()
    try:
        generate_weekly_reports_for_all_users(db)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("event=weekly_report_job_failed")
    finally:
        db.close()


@app.on_event("startup")
def _start_scheduler() -> None:
    global _scheduler
    if os.getenv("ENABLE_WEEKLY_REPORT_CRON", "0") != "1":
        return
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(_run_weekly_reports, CronTrigger(day_of_week="sun", hour=2, minute=0))
    _scheduler.start()


@app.on_event("shutdown")
def _stop_scheduler() -> None:
    if _scheduler:
        _scheduler.shutdown()


@app.middleware("http")
async def api_request_logging_middleware(request: Request, call_next):
    started = time.perf_counter()
    path = request.url.path
    method = request.method
    try:
        response = await call_next(request)
        logger.info(request_log_line(method, path, response.status_code, time.perf_counter() - started))
        if "/agent" in path or path.endswith("/ask") or "/ask-live" in path:
            logger.info(f'event=agent_execution method={method} path="{path}" status={response.status_code}')
        return response
    except Exception:
        logger.exception(f'event=request_error method={method} path="{path}"')
        raise


@app.get("/health")
def root_health():
    return {"status": "ok", "service": "evolvai-backend"}


@app.get("/api/v1/health")
def health():
    return {"success": True, "data": {"status": "ok", "service": "evolvai-os"}}


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(_, exc: SQLAlchemyError):
    logger.exception("event=sqlalchemy_exception")
    return JSONResponse(status_code=500, content={"success": False, "error": "database_error", "detail": str(exc)})


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException):
    logger.warning(f"event=http_exception status={exc.status_code} detail={exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": "http_error", "detail": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_, exc: RequestValidationError):
    logger.warning("event=validation_exception")
    return JSONResponse(
        status_code=422,
        content={"success": False, "error": "validation_error", "detail": exc.errors()},
    )


