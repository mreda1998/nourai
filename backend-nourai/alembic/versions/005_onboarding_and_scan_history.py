"""Add onboarding fields to user_profiles and create scan_history table.

Revision ID: 005
Revises: 004
Create Date: 2026-03-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── New onboarding columns on user_profiles ──────────────────────────────
    op.add_column(
        "user_profiles",
        sa.Column("age_range", sa.String(20), nullable=True),
    )
    op.add_column(
        "user_profiles",
        sa.Column(
            "focus_areas",
            JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "user_profiles",
        sa.Column(
            "health_concerns",
            JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "user_profiles",
        sa.Column(
            "is_pregnant",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "user_profiles",
        sa.Column(
            "is_breastfeeding",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    # ── scan_history table ───────────────────────────────────────────────────
    op.create_table(
        "scan_history",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("user_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "scanned_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_scan_history_user_id", "scan_history", ["user_id"])
    op.create_index("ix_scan_history_scanned_at", "scan_history", ["scanned_at"])
    op.create_index(
        "ix_scan_history_user_scanned",
        "scan_history",
        ["user_id", "scanned_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_scan_history_user_scanned", "scan_history")
    op.drop_index("ix_scan_history_scanned_at", "scan_history")
    op.drop_index("ix_scan_history_user_id", "scan_history")
    op.drop_table("scan_history")

    op.drop_column("user_profiles", "is_breastfeeding")
    op.drop_column("user_profiles", "is_pregnant")
    op.drop_column("user_profiles", "health_concerns")
    op.drop_column("user_profiles", "focus_areas")
    op.drop_column("user_profiles", "age_range")
