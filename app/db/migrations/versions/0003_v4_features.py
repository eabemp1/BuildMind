"""0003_v4_features — Recovery Mode, Execution Scorecards, Persona Rotation state

NEW IN V4 (Playbook §4.1–4.5):
  - founder_context: recovery_mode_active, reset_mission_complete columns
  - execution_scorecards: new table for Shareable Execution Scorecard
  - founder_context: persona_week column for Agent Persona Rotation state tracking

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-27
"""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    existing_cols_fc = {c["name"] for c in inspector.get_columns("founder_context")} \
        if "founder_context" in existing_tables else set()

    # ── founder_context additions for Recovery Mode & Persona Rotation ────────
    if "founder_context" in existing_tables:
        if "recovery_mode_active" not in existing_cols_fc:
            op.add_column(
                "founder_context",
                sa.Column("recovery_mode_active", sa.Boolean(), nullable=False, server_default="false"),
            )
        if "reset_mission_complete" not in existing_cols_fc:
            op.add_column(
                "founder_context",
                sa.Column("reset_mission_complete", sa.Boolean(), nullable=False, server_default="false"),
            )
        if "persona_week" not in existing_cols_fc:
            # Tracks which Agent B persona was active last week (0–3, cycles mod 4)
            # Stored so we can log rotation state in context object per playbook §4.4
            op.add_column(
                "founder_context",
                sa.Column("persona_week", sa.Integer(), nullable=True),
            )
        if "consecutive_tasks_completed" not in existing_cols_fc:
            # Used by Emotional Language Layer — triggers warmth after 2 in a row
            op.add_column(
                "founder_context",
                sa.Column("consecutive_tasks_completed", sa.Integer(), nullable=False, server_default="0"),
            )

    # ── execution_scorecards — Shareable Execution Scorecard (Playbook §4.3) ─
    if "execution_scorecards" not in existing_tables:
        op.create_table(
            "execution_scorecards",
            sa.Column("id",                 sa.String(36),  primary_key=True, server_default=sa.text("gen_random_uuid()::text")),
            sa.Column("user_id",            sa.String(36),  nullable=False, index=True),
            sa.Column("startup_category",   sa.String(120), nullable=True),
            sa.Column("market_gap",         sa.Text(),      nullable=True),
            sa.Column("momentum_score",     sa.Integer(),   nullable=False, server_default="50"),
            sa.Column("stage",              sa.String(60),  nullable=True),
            sa.Column("days_active",        sa.Integer(),   nullable=False, server_default="0"),
            sa.Column("tasks_completed",    sa.Integer(),   nullable=False, server_default="0"),
            sa.Column("share_text",         sa.Text(),      nullable=True),
            sa.Column("shared_at",          sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at",         sa.DateTime(timezone=True), server_default=sa.text("now()")),
        )


def downgrade() -> None:
    # Column removal risks data loss — restore from snapshot to roll back.
    pass
