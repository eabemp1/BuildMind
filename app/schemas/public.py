from datetime import datetime

from pydantic import BaseModel, Field


class PublicProjectUpdateOut(BaseModel):
    id: int
    project_id: int
    user_id: int
    content: str
    created_at: datetime


class PublicProjectOut(BaseModel):
    id: int
    title: str
    description: str | None
    progress: float
    milestones_completed: int
    milestones_total: int
    likes: int
    followers: int
    is_public: bool
    founder_name: str
    founder_username: str | None = None
    created_at: datetime


class PublicProjectDetailOut(BaseModel):
    id: int
    title: str
    description: str | None
    problem: str | None = None
    target_users: str | None = None
    progress: float
    likes: int
    followers: int
    is_public: bool
    founder_name: str
    founder_username: str | None = None
    created_at: datetime
    milestones: list[dict]
    updates: list[PublicProjectUpdateOut]
    comments: list[dict]


class PublicProjectUpdateCreateRequest(BaseModel):
    content: str = Field(min_length=3, max_length=5000)


class PublicProjectCommentCreateRequest(BaseModel):
    author_name: str | None = Field(default=None, max_length=120)
    content: str = Field(min_length=3, max_length=2000)


class FounderProfileOut(BaseModel):
    id: int
    username: str | None
    email: str
    bio: str | None
    avatar_url: str | None
    followers: int
    projects: list[PublicProjectOut]
    recent_updates: list[PublicProjectUpdateOut]


class SearchResultProjectOut(BaseModel):
    id: int
    title: str


class SearchResultMilestoneOut(BaseModel):
    id: int
    title: str
    project_id: int


class SearchResultTaskOut(BaseModel):
    id: int
    title: str
    project_id: int


class SearchResultsOut(BaseModel):
    projects: list[SearchResultProjectOut]
    milestones: list[SearchResultMilestoneOut]
    tasks: list[SearchResultTaskOut]
