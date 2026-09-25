"""Add structure_image_url to ingredients.

Revision ID: 016
Revises: 015
Create Date: 2026-08-26
"""
from alembic import op
import sqlalchemy as sa

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ingredients", sa.Column("structure_image_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("ingredients", "structure_image_url")
