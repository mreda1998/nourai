"""Add ingredient_biodomain_scores table.

Revision ID: 006
Revises: 005
Create Date: 2026-04-14
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ingredient_biodomain_scores",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),

        # FK to ingredients
        sa.Column("ingredient_id", UUID(as_uuid=True), sa.ForeignKey("ingredients.id", ondelete="CASCADE"), nullable=False),

        # One of the 10 canonical biodomain keys
        sa.Column("biodomain", sa.String(50), nullable=False),

        # Effect direction and strength
        sa.Column("direction", sa.String(10), nullable=False, server_default="neutral"),
        sa.Column("magnitude", sa.Float(), nullable=False, server_default="0.0"),

        # Evidence quality summary
        sa.Column("confidence", sa.String(10), nullable=False, server_default="low"),
        sa.Column("evidence_count", sa.Integer(), nullable=False, server_default="0"),

        # Dose-response
        sa.Column("dose_dependent", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("effective_dose_low", sa.Float(), nullable=True),
        sa.Column("effective_dose_high", sa.Float(), nullable=True),
        sa.Column("dose_unit", sa.String(20), nullable=True),

        # Claude reasoning (for auditability)
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_index("ix_ingredient_biodomain_scores_ingredient_id", "ingredient_biodomain_scores", ["ingredient_id"])
    op.create_index("ix_ingredient_biodomain_scores_biodomain", "ingredient_biodomain_scores", ["biodomain"])
    op.create_unique_constraint(
        "uq_ingredient_biodomain",
        "ingredient_biodomain_scores",
        ["ingredient_id", "biodomain"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_ingredient_biodomain", "ingredient_biodomain_scores", type_="unique")
    op.drop_index("ix_ingredient_biodomain_scores_biodomain", table_name="ingredient_biodomain_scores")
    op.drop_index("ix_ingredient_biodomain_scores_ingredient_id", table_name="ingredient_biodomain_scores")
    op.drop_table("ingredient_biodomain_scores")
