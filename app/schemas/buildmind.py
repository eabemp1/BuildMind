from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class ActivityOut(BaseModel):
    id: int
    user_id: int
    activity_type: str
    reference_id: int | None
    created_at: datetime


class NotificationOut(BaseModel):
    id: int
    user_id: int
    type: str
    message: str
    reference_id: int | None
    is_read: bool
    created_at: datetime


class NotificationPreferenceRequest(BaseModel):
    feedback_received: bool = True
    milestone_completed: bool = True
    task_assigned: bool = True


class NotificationPreferenceOut(BaseModel):
    user_id: int
    feedback_received: bool
    milestone_completed: bool
    task_assigned: bool
    updated_at: datetime


class NewsletterSubscriptionRequest(BaseModel):
    email: EmailStr


class NewsletterSubscriptionOut(BaseModel):
    id: int
    email: EmailStr
    subscribed: bool
    created_at: datetime


class AdminPlatformAnalyticsOut(BaseModel):
    total_users: int
    total_projects: int
    total_milestones: int
    total_tasks: int
    daily_active_users: int
    user_growth: list[dict]
    project_creation_trends: list[dict]
    task_completion_rates: list[dict]


class AdminUserOut(BaseModel):
    id: int
    username: str | None
    email: str
    is_active: bool
    is_admin: bool
    created_at: datetime


class AdminProjectOut(BaseModel):
    id: int
    user_id: int
    title: str
    progress: float
    stage: str
    is_archived: bool
    created_at: datetime


class AccountDeleteRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)
