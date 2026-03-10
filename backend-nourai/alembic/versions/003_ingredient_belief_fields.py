"""Add common_belief and evidence_reality columns to ingredients

Revision ID: 003
Revises: 002
Create Date: 2026-03-03

These two Text columns store the synthesized "belief vs. reality" summary
written by the research agent for each ingredient. They are the backbone
of the ingredient deep dive screen — showing users the gap between what
they expect an ingredient to do and what the research actually supports.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ingredients",
        sa.Column("common_belief", sa.Text(), nullable=True),
    )
    op.add_column(
        "ingredients",
        sa.Column("evidence_reality", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ingredients", "evidence_reality")
    op.drop_column("ingredients", "common_belief")
