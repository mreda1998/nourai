"""Add ingredient_interactions table.

Revision ID: 012
Revises: 011
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ingredient_interactions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "ingredient_id_a",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ingredients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "ingredient_id_b",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ingredients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("interaction_type", sa.String(20), nullable=False),
        sa.Column("mechanism", sa.Text(), nullable=False),
        sa.Column("confidence", sa.String(10), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.UniqueConstraint("ingredient_id_a", "ingredient_id_b", name="uq_interaction_pair"),
    )
    op.create_index("ix_interactions_a", "ingredient_interactions", ["ingredient_id_a"])
    op.create_index("ix_interactions_b", "ingredient_interactions", ["ingredient_id_b"])


def downgrade() -> None:
    op.drop_index("ix_interactions_b", table_name="ingredient_interactions")
    op.drop_index("ix_interactions_a", table_name="ingredient_interactions")
    op.drop_table("ingredient_interactions")
