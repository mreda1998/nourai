"""Add domain_tags to ingredient_evidence, domain_effects + mechanism_image_url to ingredients.

Revision ID: 006
Revises: 005
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── ingredient_evidence: add domain_tags ──────────────────────────────────
    op.add_column(
        "ingredient_evidence",
        sa.Column(
            "domain_tags",
            JSONB,
            nullable=False,
            server_default="[]",
            comment="Bio-domain slugs this study is relevant to (gut-health, skin, metabolism, etc.)",
        ),
    )
    op.create_index(
        "ix_ingredient_evidence_domain_tags",
        "ingredient_evidence",
        ["domain_tags"],
        postgresql_using="gin",
    )

    # ── ingredients: add domain_effects (pre-computed per-domain summaries) ───
    op.add_column(
        "ingredients",
        sa.Column(
            "domain_effects",
            JSONB,
            nullable=True,
            comment=(
                "Pre-computed per-bio-domain effect summary. "
                "Keys: gut-health, skin, metabolism, sleep-recovery, cognition, exposure-load. "
                "Values: {direction, confidence, evidence_count, top_finding}"
            ),
        ),
    )

    # ── ingredients: add mechanism_image_url (generated illustration) ─────────
    op.add_column(
        "ingredients",
        sa.Column(
            "mechanism_image_url",
            sa.Text,
            nullable=True,
            comment="URL to the generated mechanism-of-action research board illustration",
        ),
    )


def downgrade() -> None:
    op.drop_index("ix_ingredient_evidence_domain_tags", table_name="ingredient_evidence")
    op.drop_column("ingredient_evidence", "domain_tags")
    op.drop_column("ingredients", "domain_effects")
    op.drop_column("ingredients", "mechanism_image_url")
