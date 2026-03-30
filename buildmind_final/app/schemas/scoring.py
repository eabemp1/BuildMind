from datetime import datetime

from pydantic import BaseModel


class ScoreComponentsOut(BaseModel):
    task_completion_rate: float
    weekly_consistency: float
    execution_velocity: float
    focus_score: float
    milestone_completion_rate: float
    feedback_positivity_ratio: float


class ScoreSnapshotOut(BaseModel):
    id: int
    score: float
    calculated_at: datetime


class ScoreSummaryOut(BaseModel):
    execution_score: float
    components: ScoreComponentsOut
    history: list[ScoreSnapshotOut]
