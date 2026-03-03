"""Execution Tracking SaaS v1 (FastAPI entrypoint).

This app intentionally focuses on structured execution support:
- auth
- project + roadmap
- task completion
- feedback
- measurable execution score
"""

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.database import Base, engine
from app.routes.auth import router as auth_router
from app.routes.projects import router as projects_router
from app.routes.tasks import router as tasks_router
from app.routes.feedback import router as feedback_router
from app.routes.dashboard import router as dashboard_router


Base.metadata.create_all(bind=engine)

app = FastAPI(title="Execution Tracking SaaS v1")

app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(tasks_router)
app.include_router(feedback_router)
app.include_router(dashboard_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "execution-tracking-v1"}


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(_, exc: SQLAlchemyError):
    return JSONResponse(status_code=500, content={"error": "database_error", "detail": str(exc)})

