"""ORM models for execution tracking SaaS v1."""

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    projects: Mapped[list["Project"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    feedback: Mapped[list["Feedback"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    score_history: Mapped[list["ExecutionScoreHistory"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    reminder_preference: Mapped["ReminderPreference"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    profile: Mapped["UserProfile"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    roadmap_json: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="projects")
    milestones: Mapped[list["Milestone"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Milestone(Base):
    __tablename__ = "milestones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    project: Mapped["Project"] = relationship(back_populates="milestones")
    tasks: Mapped[list["Task"]] = relationship(back_populates="milestone", cascade="all, delete-orphan")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    milestone_id: Mapped[int] = mapped_column(ForeignKey("milestones.id", ondelete="CASCADE"), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    milestone: Mapped["Milestone"] = relationship(back_populates="tasks")
    feedback: Mapped[list["Feedback"]] = relationship(back_populates="task")


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    feedback_type: Mapped[str] = mapped_column(String(16), nullable=False)  # positive | negative
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="feedback")
    task: Mapped["Task"] = relationship(back_populates="feedback")


class ExecutionScoreHistory(Base):
    __tablename__ = "execution_score_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="score_history")


class AppState(Base):
    __tablename__ = "app_state"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value_json: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)


class ReminderPreference(Base):
    __tablename__ = "reminder_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, unique=True, nullable=False)
    reminder_time: Mapped[str] = mapped_column(String(5), nullable=False)  # HH:MM 24-hour
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    last_triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="reminder_preference")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    country: Mapped[str] = mapped_column(String(120), nullable=True)
    startup_stage: Mapped[str] = mapped_column(String(120), nullable=True)
    industry: Mapped[str] = mapped_column(String(120), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="profile")


