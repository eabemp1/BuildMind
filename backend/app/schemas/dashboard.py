from datetime import datetime

from pydantic import BaseModel


class ExecutionScoreSnapshotOut(BaseModel):
    id: int
    score: float
    calculated_at: datetime


class DashboardResponse(BaseModel):
    user_id: int
    project_count: int
    milestone_count: int
    task_count: int
    task_completion_rate: float
    weekly_consistency: float
    milestone_completion_rate: float
    feedback_positivity_ratio: float
    execution_score: float
    score_history: list[ExecutionScoreSnapshotOut]


