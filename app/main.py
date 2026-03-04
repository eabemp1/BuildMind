"""Unified EvolvAI OS backend application.

Single FastAPI app that combines:
- agent/adaptive capabilities
- execution tracking capabilities
"""

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


Base.metadata.create_all(bind=engine)

app.title = "EvolvAI OS"

app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(tasks_router)
app.include_router(feedback_router)
app.include_router(dashboard_router)
app.include_router(scoring_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "evolvai-os"}


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(_, exc: SQLAlchemyError):
    return JSONResponse(status_code=500, content={"error": "database_error", "detail": str(exc)})


