"""Unified EvolvAI OS backend application.

Single FastAPI app that combines:
- agent/adaptive capabilities
- execution tracking capabilities
"""

import logging
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
from app.routes.scoring import router as scoring_router
from app.routes.report import router as report_router
from app.routes.reminder import router as reminder_router
from app.routes.opportunities import router as opportunities_router
from app.core.config import get_settings
from app.core.logging_config import configure_logging, request_log_line


Base.metadata.create_all(bind=engine)


def _ensure_runtime_schema() -> None:
    inspector = sa_inspect(engine)
    try:
        project_columns = {col["name"] for col in inspector.get_columns("projects")}
    except Exception:
        project_columns = set()
    if "roadmap_json" not in project_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE projects ADD COLUMN roadmap_json TEXT"))


_ensure_runtime_schema()

app.title = "EvolvAI OS"
configure_logging()
logger = logging.getLogger("evolvai")
settings = get_settings()

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
app.include_router(scoring_router, prefix="/api/v1")
app.include_router(report_router, prefix="/api/v1")
app.include_router(reminder_router, prefix="/api/v1")
app.include_router(opportunities_router, prefix="/api/v1")


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


