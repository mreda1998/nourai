"""Add circadian timing fields to ingredients table.

Revision ID: 011
Revises: 010
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ingredients", sa.Column("optimal_times", postgresql.JSONB(), nullable=True))
    op.add_column("ingredients", sa.Column("avoid_near_sleep", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("ingredients", sa.Column("circadian_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("ingredients", "circadian_notes")
    op.drop_column("ingredients", "avoid_near_sleep")
    op.drop_column("ingredients", "optimal_times")
