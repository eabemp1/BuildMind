from datetime import datetime

from pydantic import BaseModel, Field


class ValidationDataCreateRequest(BaseModel):
    project_id: int
    users_interviewed: int = Field(default=0, ge=0)
    interested_users: int = Field(default=0, ge=0)
    preorders: int = Field(default=0, ge=0)
    feedback_sentiment: str = Field(default="neutral", min_length=3, max_length=16)


class ValidationDataOut(BaseModel):
    id: int
    project_id: int
    users_interviewed: int
    interested_users: int
    preorders: int
    feedback_sentiment: str
    created_at: datetime


class StartupMetricsCreateRequest(BaseModel):
    project_id: int
    milestones_completed: int = Field(default=0, ge=0)
    tasks_completed: int = Field(default=0, ge=0)
    early_users: int = Field(default=0, ge=0)
    active_users: int = Field(default=0, ge=0)
    execution_streak: int = Field(default=0, ge=0)


class StartupMetricsOut(BaseModel):
    id: int
    project_id: int
    milestones_completed: int
    tasks_completed: int
    early_users: int
    active_users: int
    execution_streak: int
    updated_at: datetime
