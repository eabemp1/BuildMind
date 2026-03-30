from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class FeedbackRequest(BaseModel):
    project_id: int | None = None
    task_id: int | None = None
    feedback_type: Literal["positive", "negative"] | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    category: Literal["product", "UX", "growth", "monetization"] | None = None
    comment: str | None = Field(default=None, max_length=5000)


class FeedbackResponse(BaseModel):
    id: int
    user_id: int
    project_id: int | None
    task_id: int | None
    feedback_type: str | None
    rating: int | None
    category: str | None
    comment: str | None
    created_at: datetime



