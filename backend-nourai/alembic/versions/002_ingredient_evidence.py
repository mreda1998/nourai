"""Add ingredient_evidence table and research tracking columns to ingredients

Revision ID: 002
Revises: 001
Create Date: 2026-02-25

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Add research tracking columns to ingredients ───────────────────────────
    op.add_column(
        "ingredients",
        sa.Column(
            "research_status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "ingredients",
        sa.Column(
            "researched_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_ingredients_research_status",
        "ingredients",
        ["research_status"],
    )

    # ── Create ingredient_evidence table ──────────────────────────────────────
    op.create_table(
        "ingredient_evidence",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),

        # Foreign key
        sa.Column(
            "ingredient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ingredients.id", ondelete="CASCADE"),
            nullable=False,
        ),

        # PubMed source
        sa.Column("pmid", sa.String(20), nullable=True),
        sa.Column("doi", sa.String(200), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("journal", sa.String(255), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("raw_abstract", sa.Text(), nullable=True),

        # Claude synthesis — study characteristics
        sa.Column("study_type", sa.String(30), nullable=True),
        sa.Column("population", sa.String(150), nullable=True),
        sa.Column("sample_size", sa.Integer(), nullable=True),

        # Core finding
        sa.Column("finding", sa.Text(), nullable=False),
        sa.Column("direction", sa.String(20), nullable=False, server_default="neutral"),
        sa.Column("effect_size", sa.String(20), nullable=True),
        sa.Column("confidence", sa.String(20), nullable=False, server_default="low"),

        # Personalization tags (GIN-indexed for fast JSONB containment queries)
        sa.Column(
            "concern_tags",
            postgresql.JSONB(),
            nullable=False,
            server_default="[]",
        ),
        sa.Column(
            "goal_tags",
            postgresql.JSONB(),
            nullable=False,
            server_default="[]",
        ),

        # Timestamps
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Indexes
    op.create_index(
        "ix_ingredient_evidence_ingredient_id",
        "ingredient_evidence",
        ["ingredient_id"],
    )
    op.create_index(
        "ix_ingredient_evidence_pmid",
        "ingredient_evidence",
        ["pmid"],
    )
    op.create_index(
        "ix_ingredient_evidence_direction",
        "ingredient_evidence",
        ["direction"],
    )
    # GIN indexes for JSONB array containment queries
    op.create_index(
        "ix_ingredient_evidence_concern_tags",
        "ingredient_evidence",
        ["concern_tags"],
        postgresql_using="gin",
    )
    op.create_index(
        "ix_ingredient_evidence_goal_tags",
        "ingredient_evidence",
        ["goal_tags"],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_table("ingredient_evidence")
    op.drop_index("ix_ingredients_research_status", table_name="ingredients")
    op.drop_column("ingredients", "researched_at")
    op.drop_column("ingredients", "research_status")
