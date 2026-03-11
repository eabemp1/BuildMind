from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCreateRequest(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: str = Field(default="", max_length=2000)
    problem: str | None = Field(default=None, max_length=5000)
    target_users: str | None = Field(default=None, max_length=5000)
    is_public: bool | None = None


class RoadmapGenerateRequest(BaseModel):
    goal_duration_weeks: int = Field(default=4, ge=1, le=52)


class AgentRoadmapGenerateRequest(BaseModel):
    idea_description: str = Field(min_length=10, max_length=3000)
    country: str = Field(min_length=2, max_length=120)
    industry: str = Field(min_length=2, max_length=120)
    stage: str = Field(min_length=2, max_length=120)


class AgentRoadmapStageOut(BaseModel):
    stage: str
    tasks: list[str]


class AgentRoadmapOut(BaseModel):
    roadmap: list[AgentRoadmapStageOut]


class TaskOut(BaseModel):
    id: int
    title: str | None = None
    description: str
    status: str = "todo"
    priority: str = "medium"
    due_date: datetime | None = None
    is_completed: bool
    completed_at: datetime | None


class MilestoneOut(BaseModel):
    id: int
    title: str
    status: str = "pending"
    order_index: int = 0
    completed_at: datetime | None = None
    week_number: int | None = None
    is_completed: bool
    tasks: list[TaskOut]


class ProjectOut(BaseModel):
    id: int
    user_id: int
    title: str
    description: str | None
    problem: str | None = None
    target_users: str | None = None
    progress: float = 0
    is_public: bool = False
    likes: int = 0
    followers: int = 0
    is_archived: bool = False
    archived_at: datetime | None = None
    created_at: datetime
    milestones: list[MilestoneOut]


class ProjectUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    problem: str | None = Field(default=None, max_length=5000)
    target_users: str | None = Field(default=None, max_length=5000)
    progress: float | None = Field(default=None, ge=0.0, le=100.0)
    is_public: bool | None = None


class MilestoneUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    status: str | None = Field(default=None, min_length=2, max_length=32)
    order_index: int | None = Field(default=None, ge=0)


class MilestoneReorderItem(BaseModel):
    milestone_id: int
    order_index: int = Field(ge=0)


class MilestoneReorderRequest(BaseModel):
    items: list[MilestoneReorderItem] = Field(min_length=1)


class TaskCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str = Field(min_length=2, max_length=5000)
    status: str = Field(default="todo", min_length=2, max_length=32)
    priority: str = Field(default="medium", min_length=2, max_length=16)
    due_date: datetime | None = None


class TaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = Field(default=None, min_length=2, max_length=5000)
    status: str | None = Field(default=None, min_length=2, max_length=32)
    priority: str | None = Field(default=None, min_length=2, max_length=16)
    due_date: datetime | None = None



