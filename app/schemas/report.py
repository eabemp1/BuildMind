from datetime import date

from pydantic import BaseModel


class DailyExecutionScoreOut(BaseModel):
    date: date
    score: float


class DailyTaskCompletionOut(BaseModel):
    date: date
    completion_rate: float
    tasks_completed: int


class DailyMilestoneAchievementOut(BaseModel):
    date: date
    count: int


class WeeklyFeedbackOut(BaseModel):
    positive: int
    negative: int
    positive_ratio: float


class WeeklyReportOut(BaseModel):
    start_date: date
    end_date: date
    execution_score_trend: list[DailyExecutionScoreOut]
    weekly_task_completion: list[DailyTaskCompletionOut]
    milestone_achievement: list[DailyMilestoneAchievementOut]
    tasks_completed_this_week: int
    feedback: WeeklyFeedbackOut
