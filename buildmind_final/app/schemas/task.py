from datetime import datetime

from pydantic import BaseModel


class CompleteTaskResponse(BaseModel):
    id: int
    milestone_id: int
    description: str
    is_completed: bool
    completed_at: datetime | None



