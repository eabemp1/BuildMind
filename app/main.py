"""EvolvAI OS — unified backend.

Combines execution-tracking APIs with the Lumiere agent runtime.
The agent runtime is mounted as a sub-application so its flat-file
state and auth system are fully isolated from the JWT/SQLAlchemy
auth used by the rest of the platform.
"""

import logging
import os
import time

from fastapi import FastAPI, HTTPException, Request
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.rate_limit import limiter
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy import inspect as sa_inspect, text
from sqlalchemy.exc import SQLAlchemyError

# ── Explicit runtime imports (replaces the dangerous star import) ─────────────
from app.agent.runtime import app as lumiere_app  # noqa: F401 – sub-app
from app.database import Base, engine, SessionLocal
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
from app.routes.startup_data import router as startup_data_router
from app.core.config import get_settings
from app.core.logging_config import configure_logging, request_log_line
from app.services.weekly_report_service import generate_weekly_reports_for_all_users

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

# ── DB bootstrap ──────────────────────────────────────────────────────────────
# Schema is managed by Alembic migrations.
# Run `alembic upgrade head` before starting the server.
# Migration 0002 (app/db/migrations/versions/0002_add_missing_columns.py) covers
# all the column additions that were previously patched here at boot time.
# create_all() is kept as a safety net for any tables Alembic doesn't yet track.
Base.metadata.create_all(bind=engine)

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="EvolvAI OS")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
configure_logging()
logger = logging.getLogger("evolvai")
settings = get_settings()
_scheduler: BackgroundScheduler | None = None

frontend_origins = [o.strip() for o in settings.FRONTEND_ORIGINS.split(",") if o.strip()]
allow_all = "*" in frontend_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all else frontend_origins,
    allow_credentials=False if allow_all else True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount Lumiere agent as an isolated sub-application ────────────────────────
# This keeps the agent's flat-file auth/session system completely separate from
# the JWT platform auth.  All agent calls go to /agent/*, never /api/v1/*.
app.mount("/agent", lumiere_app)

# ── Platform API routers ──────────────────────────────────────────────────────
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
app.include_router(startup_data_router, prefix="/api/v1")


def _install_v1_aliases() -> None:
    """Expose /api/v1 aliases for any legacy non-versioned routes."""
    skip_prefixes = {"/api/v1", "/agent", "/docs", "/redoc", "/openapi.json", "/static", "/health"}
    snapshot = list(app.routes)
    existing: set[tuple] = set()
    for route in snapshot:
        if not isinstance(route, APIRoute):
            continue
        methods = tuple(sorted(m for m in (route.methods or set()) if m not in {"HEAD", "OPTIONS"}))
        existing.add((route.path, methods))

    for route in snapshot:
        if not isinstance(route, APIRoute):
            continue
        if any(route.path.startswith(p) for p in skip_prefixes):
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


# ── Background jobs ───────────────────────────────────────────────────────────
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


# ── Middleware ────────────────────────────────────────────────────────────────
@app.middleware("http")
async def api_request_logging_middleware(request: Request, call_next):
    started = time.perf_counter()
    path = request.url.path
    method = request.method
    try:
        response = await call_next(request)
        logger.info(request_log_line(method, path, response.status_code, time.perf_counter() - started))
        return response
    except Exception:
        logger.exception(f'event=request_error method={method} path="{path}"')
        raise


# ── Health endpoints ──────────────────────────────────────────────────────────
@app.get("/health")
def root_health():
    return {"status": "ok", "service": "evolvai-backend"}


@app.get("/api/v1/health")
def health():
    return {"success": True, "data": {"status": "ok", "service": "evolvai-os"}}


# ── Exception handlers ────────────────────────────────────────────────────────
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
