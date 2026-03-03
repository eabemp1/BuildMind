from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class FeedbackRequest(BaseModel):
    task_id: int | None = None
    feedback_type: Literal["positive", "negative"]


class FeedbackResponse(BaseModel):
    id: int
    user_id: int
    task_id: int | None
    feedback_type: str
    created_at: datetime


