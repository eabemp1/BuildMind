from datetime import datetime

from pydantic import BaseModel, Field


class ReminderPreferenceUpsertRequest(BaseModel):
    reminder_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    enabled: bool = True


class ReminderPreferenceOut(BaseModel):
    user_id: int
    reminder_time: str
    enabled: bool
    updated_at: datetime
    last_triggered_at: datetime | None
