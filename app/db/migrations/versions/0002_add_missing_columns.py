"""Add columns that _ensure_runtime_schema patched at boot time.

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-26

Moves every runtime ALTER TABLE from app/main.py into a proper Alembic
migration so schema drift is tracked, reviewable, and reproducible.
After applying this migration delete _ensure_runtime_schema() from main.py.
"""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _add_if_missing(table: str, column: str, col_type: str, default: str | None = None) -> None:
    """Add a column only when it does not already exist (idempotent)."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns(table)}
    if column in existing:
        return
    default_clause = f" DEFAULT {default}" if default is not None else ""
    bind.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}{default_clause}"))


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────
    _add_if_missing("users", "username",             "VARCHAR(100)")
    _add_if_missing("users", "password_hash",        "VARCHAR(255)")
    _add_if_missing("users", "bio",                  "TEXT")
    _add_if_missing("users", "avatar_url",           "VARCHAR(500)")
    _add_if_missing("users", "followers",            "INTEGER", "0")
    _add_if_missing("users", "onboarding_completed", "BOOLEAN",  "false")
    _add_if_missing("users", "is_active",            "BOOLEAN",  "true")
    _add_if_missing("users", "is_admin",             "BOOLEAN",  "false")

    # ── projects ──────────────────────────────────────────────────────────
    _add_if_missing("projects", "roadmap_json",     "TEXT")
    _add_if_missing("projects", "problem",          "TEXT")
    _add_if_missing("projects", "target_users",     "TEXT")
    _add_if_missing("projects", "industry",         "VARCHAR(120)")
    _add_if_missing("projects", "target_market",    "VARCHAR(255)")
    _add_if_missing("projects", "problem_type",     "VARCHAR(120)")
    _add_if_missing("projects", "revenue_model",    "VARCHAR(120)")
    _add_if_missing("projects", "startup_stage",    "VARCHAR(32)")
    _add_if_missing("projects", "validation_score", "FLOAT",   "0")
    _add_if_missing("projects", "execution_score",  "FLOAT",   "0")
    _add_if_missing("projects", "momentum_score",   "FLOAT",   "0")
    _add_if_missing("projects", "progress",         "FLOAT",   "0")
    _add_if_missing("projects", "is_public",        "BOOLEAN", "false")
    _add_if_missing("projects", "likes",            "INTEGER", "0")
    _add_if_missing("projects", "followers",        "INTEGER", "0")
    _add_if_missing("projects", "is_archived",      "BOOLEAN", "false")
    _add_if_missing("projects", "archived_at",      "TIMESTAMP")

    # ── milestones ────────────────────────────────────────────────────────
    _add_if_missing("milestones", "description",  "TEXT")
    _add_if_missing("milestones", "status",       "VARCHAR(32)", "'pending'")
    _add_if_missing("milestones", "order_index",  "INTEGER",     "0")
    _add_if_missing("milestones", "completed_at", "TIMESTAMP")

    # ── tasks ─────────────────────────────────────────────────────────────
    _add_if_missing("tasks", "title",    "VARCHAR(255)")
    _add_if_missing("tasks", "status",   "VARCHAR(32)", "'todo'")
    _add_if_missing("tasks", "priority", "VARCHAR(16)", "'medium'")
    _add_if_missing("tasks", "due_date", "TIMESTAMP")

    # ── feedback ──────────────────────────────────────────────────────────
    _add_if_missing("feedback", "project_id", "INTEGER")
    _add_if_missing("feedback", "rating",     "INTEGER")
    _add_if_missing("feedback", "category",   "VARCHAR(32)")
    _add_if_missing("feedback", "comment",    "TEXT")

    # ── extra tables ──────────────────────────────────────────────────────
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "project_updates" not in existing_tables:
        op.create_table(
            "project_updates",
            sa.Column("id",         sa.Integer(),  primary_key=True),
            sa.Column("project_id", sa.Integer(),  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("user_id",    sa.Integer(),  sa.ForeignKey("users.id",    ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("content",    sa.Text(),     nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True)),
        )

    if "project_comments" not in existing_tables:
        op.create_table(
            "project_comments",
            sa.Column("id",          sa.Integer(),    primary_key=True),
            sa.Column("project_id",  sa.Integer(),    sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("author_name", sa.String(120)),
            sa.Column("content",     sa.Text(),       nullable=False),
            sa.Column("created_at",  sa.DateTime(timezone=True)),
        )

    if "validation_data" not in existing_tables:
        op.create_table(
            "validation_data",
            sa.Column("id",                 sa.Integer(),   primary_key=True),
            sa.Column("project_id",         sa.Integer(),   sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
            sa.Column("users_interviewed",  sa.Integer(),   default=0, nullable=False),
            sa.Column("interested_users",   sa.Integer(),   default=0, nullable=False),
            sa.Column("preorders",          sa.Integer(),   default=0, nullable=False),
            sa.Column("feedback_sentiment", sa.String(16),  default="neutral", nullable=False),
            sa.Column("created_at",         sa.DateTime(timezone=True)),
        )

    if "startup_metrics" not in existing_tables:
        op.create_table(
            "startup_metrics",
            sa.Column("id",                   sa.Integer(), primary_key=True),
            sa.Column("project_id",           sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
            sa.Column("milestones_completed", sa.Integer(), default=0, nullable=False),
            sa.Column("tasks_completed",      sa.Integer(), default=0, nullable=False),
            sa.Column("early_users",          sa.Integer(), default=0, nullable=False),
            sa.Column("active_users",         sa.Integer(), default=0, nullable=False),
            sa.Column("execution_streak",     sa.Integer(), default=0, nullable=False),
            sa.Column("updated_at",           sa.DateTime(timezone=True)),
        )


def downgrade() -> None:
    # Column removal risks data loss — restore from snapshot or recreate to roll back.
    pass
