from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCreateRequest(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: str = Field(default="", max_length=2000)


class RoadmapGenerateRequest(BaseModel):
    goal_duration_weeks: int = Field(default=4, ge=1, le=52)


class TaskOut(BaseModel):
    id: int
    description: str
    is_completed: bool
    completed_at: datetime | None


class MilestoneOut(BaseModel):
    id: int
    title: str
    week_number: int
    is_completed: bool
    tasks: list[TaskOut]


class ProjectOut(BaseModel):
    id: int
    user_id: int
    title: str
    description: str | None
    created_at: datetime
    milestones: list[MilestoneOut]


