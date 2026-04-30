"""Initial schema — all platform tables.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-04-20
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(100), unique=True, index=True, nullable=True),
        sa.Column("email", sa.String(255), unique=True, index=True, nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("followers", sa.Integer(), default=0, nullable=False),
        sa.Column("onboarding_completed", sa.Boolean(), default=False, nullable=False),
        sa.Column("is_active", sa.Boolean(), default=True, nullable=False),
        sa.Column("is_admin", sa.Boolean(), default=False, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("industry", sa.String(120), nullable=True),
        sa.Column("target_market", sa.String(255), nullable=True),
        sa.Column("problem_type", sa.String(120), nullable=True),
        sa.Column("revenue_model", sa.String(120), nullable=True),
        sa.Column("startup_stage", sa.String(32), nullable=True),
        sa.Column("validation_score", sa.Float(), default=0.0, nullable=False),
        sa.Column("execution_score", sa.Float(), default=0.0, nullable=False),
        sa.Column("momentum_score", sa.Float(), default=0.0, nullable=False),
        sa.Column("problem", sa.Text(), nullable=True),
        sa.Column("target_users", sa.Text(), nullable=True),
        sa.Column("progress", sa.Float(), default=0.0, nullable=False),
        sa.Column("roadmap_json", sa.Text(), nullable=True),
        sa.Column("is_public", sa.Boolean(), default=False, nullable=False),
        sa.Column("likes", sa.Integer(), default=0, nullable=False),
        sa.Column("followers", sa.Integer(), default=0, nullable=False),
        sa.Column("is_archived", sa.Boolean(), default=False, nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "milestones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), default="pending", nullable=False),
        sa.Column("order_index", sa.Integer(), default=0, nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("week_number", sa.Integer(), nullable=True),
        sa.Column("is_completed", sa.Boolean(), default=False, nullable=False),
    )

    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("milestone_id", sa.Integer(), sa.ForeignKey("milestones.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), default="todo", nullable=False),
        sa.Column("priority", sa.String(16), default="medium", nullable=False),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_completed", sa.Boolean(), default=False, nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "feedback",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("feedback_type", sa.String(16), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("category", sa.String(32), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "activity_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("activity_type", sa.String(64), nullable=False),
        sa.Column("reference_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("reference_id", sa.Integer(), nullable=True),
        sa.Column("is_read", sa.Boolean(), default=False, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False),
        sa.Column("feedback_received", sa.Boolean(), default=True, nullable=False),
        sa.Column("milestone_completed", sa.Boolean(), default=True, nullable=False),
        sa.Column("task_assigned", sa.Boolean(), default=True, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "newsletter_subscribers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, index=True, nullable=False),
        sa.Column("subscribed", sa.Boolean(), default=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "execution_score_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("calculated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "app_state",
        sa.Column("key", sa.String(255), primary_key=True),
        sa.Column("value_json", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "reminder_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False),
        sa.Column("reminder_time", sa.String(5), nullable=False),
        sa.Column("enabled", sa.Boolean(), default=True, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "user_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False),
        sa.Column("country", sa.String(120), nullable=True),
        sa.Column("startup_stage", sa.String(120), nullable=True),
        sa.Column("industry", sa.String(120), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "validation_data",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), unique=True, index=True, nullable=False),
        sa.Column("users_interviewed", sa.Integer(), default=0, nullable=False),
        sa.Column("interested_users", sa.Integer(), default=0, nullable=False),
        sa.Column("preorders", sa.Integer(), default=0, nullable=False),
        sa.Column("feedback_sentiment", sa.String(16), default="neutral", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "startup_metrics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), unique=True, index=True, nullable=False),
        sa.Column("milestones_completed", sa.Integer(), default=0, nullable=False),
        sa.Column("tasks_completed", sa.Integer(), default=0, nullable=False),
        sa.Column("early_users", sa.Integer(), default=0, nullable=False),
        sa.Column("active_users", sa.Integer(), default=0, nullable=False),
        sa.Column("execution_streak", sa.Integer(), default=0, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "project_updates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "project_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("author_name", sa.String(120), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "weekly_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("week_start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("projects_count", sa.Integer(), default=0, nullable=False),
        sa.Column("milestones_completed", sa.Integer(), default=0, nullable=False),
        sa.Column("tasks_completed", sa.Integer(), default=0, nullable=False),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        sa.Column("ai_risks", sa.Text(), nullable=True),
        sa.Column("ai_suggestions", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    for table in [
        "weekly_reports", "project_comments", "project_updates",
        "startup_metrics", "validation_data", "user_profiles",
        "reminder_preferences", "app_state", "execution_score_history",
        "newsletter_subscribers", "notification_preferences", "notifications",
        "activity_logs", "feedback", "tasks", "milestones", "projects", "users",
    ]:
        op.drop_table(table)
