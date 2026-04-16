"""Add unmatched_ingredient_log table.

Revision ID: 009
Revises: 008
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "unmatched_ingredient_log",
        sa.Column("name_raw", sa.String(500), primary_key=True, nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("unmatched_ingredient_log")
