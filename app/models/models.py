"""ORM models for BuildMind startup execution platform.

Database strategy:
  - The Python backend is a STATELESS AI/scoring service.
  - All primary user data (projects, milestones, tasks) lives in Supabase.
  - This SQLite/Postgres ORM is used ONLY for:
      - Execution score history (calculated server-side)
      - Weekly reports (generated server-side)
      - Activity logs (server-side events)
      - Reminder preferences (backend scheduler)
      - AI usage tracking (rate limiting)
  - User rows here are stub mirrors of Supabase users (email is the join key).
  - Never write project/milestone/task data from the backend — read from
    the payload the frontend sends, or query Supabase via service role.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """Stub mirror of a Supabase auth user. Email is the canonical join key."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # password_hash is used ONLY for the legacy /auth/login route.
    # All production auth goes through Supabase. Do not add new password logic.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    score_history: Mapped[list["ExecutionScoreHistory"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    reminder_preference: Mapped["ReminderPreference"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    activities: Mapped[list["ActivityLog"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    weekly_reports: Mapped[list["WeeklyReport"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class ExecutionScoreHistory(Base):
    __tablename__ = "execution_score_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="score_history")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    activity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    reference_id: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="activities")


class ReminderPreference(Base):
    __tablename__ = "reminder_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, unique=True, nullable=False)
    reminder_time: Mapped[str] = mapped_column(String(5), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    last_triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="reminder_preference")


class WeeklyReport(Base):
    __tablename__ = "weekly_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    week_start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    projects_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    milestones_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tasks_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ai_summary: Mapped[str] = mapped_column(Text, nullable=True)
    ai_risks: Mapped[str] = mapped_column(Text, nullable=True)
    ai_suggestions: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="weekly_reports")


class AppState(Base):
    __tablename__ = "app_state"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value_json: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
