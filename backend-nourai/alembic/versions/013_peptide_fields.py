"""Add peptide category and peptide-specific fields to ingredients.

Revision ID: 013
Revises: 012
Create Date: 2026-04-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ingredient_category is stored as a plain String column (not a PostgreSQL enum type),
    # so no ALTER TYPE is needed — 'peptide' is a new application-level enum value only.

    op.add_column("ingredients", sa.Column("us_regulatory_status", sa.String(30), nullable=True))
    op.add_column("ingredients", sa.Column("wada_status", sa.String(30), nullable=True))
    op.add_column("ingredients", sa.Column("admin_routes", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("ingredients", sa.Column("admin_route_notes", sa.Text(), nullable=True))
    op.add_column("ingredients", sa.Column("cycle_length_weeks", sa.Integer(), nullable=True))
    op.add_column("ingredients", sa.Column("washout_weeks", sa.Integer(), nullable=True))
    op.add_column("ingredients", sa.Column("cycling_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("ingredients", "cycling_notes")
    op.drop_column("ingredients", "washout_weeks")
    op.drop_column("ingredients", "cycle_length_weeks")
    op.drop_column("ingredients", "admin_route_notes")
    op.drop_column("ingredients", "admin_routes")
    op.drop_column("ingredients", "wada_status")
    op.drop_column("ingredients", "us_regulatory_status")
    # Note: PostgreSQL does not support removing enum values; downgrade leaves 'peptide' in the type.
