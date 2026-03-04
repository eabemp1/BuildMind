"""Unified EvolvAI OS backend application.

Single FastAPI app that combines:
- agent/adaptive capabilities
- execution tracking capabilities
"""

import os

from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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


Base.metadata.create_all(bind=engine)

app.title = "EvolvAI OS"

frontend_origins = [o.strip() for o in os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]
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


@app.get("/api/v1/health")
def health():
    return {"success": True, "data": {"status": "ok", "service": "evolvai-os"}}


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(_, exc: SQLAlchemyError):
    return JSONResponse(status_code=500, content={"success": False, "error": "database_error", "detail": str(exc)})


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": "http_error", "detail": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"success": False, "error": "validation_error", "detail": exc.errors()},
    )


