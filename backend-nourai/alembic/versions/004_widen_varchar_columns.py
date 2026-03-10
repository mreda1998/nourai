"""Widen VARCHAR(255) columns that overflow on real Open Food Facts data.

Revision ID: 004
Revises: 003
Create Date: 2026-03-03

OFF ingredient strings can exceed 255 characters (multi-language regulatory
text, full ingredient lists encoded as a single entry, etc.).
product_ingredients.name is the critical one that caused the first failure;
products.name / brand / summary / key_actives are widened defensively.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # product_ingredients — name is the column that caused the crash
    op.alter_column(
        "product_ingredients",
        "name",
        type_=sa.Text(),
        existing_type=sa.String(255),
        existing_nullable=False,
    )

    # products — widen defensively so bulk imports never truncate silently
    op.alter_column(
        "products",
        "name",
        type_=sa.Text(),
        existing_type=sa.String(255),
        existing_nullable=False,
    )
    op.alter_column(
        "products",
        "brand",
        type_=sa.Text(),
        existing_type=sa.String(255),
        existing_nullable=True,
    )
    op.alter_column(
        "products",
        "summary",
        type_=sa.Text(),
        existing_type=sa.String(255),
        existing_nullable=True,
    )
    op.alter_column(
        "products",
        "key_actives",
        type_=sa.Text(),
        existing_type=sa.String(255),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "product_ingredients",
        "name",
        type_=sa.String(255),
        existing_type=sa.Text(),
        existing_nullable=False,
    )
    op.alter_column(
        "products",
        "name",
        type_=sa.String(255),
        existing_type=sa.Text(),
        existing_nullable=False,
    )
    op.alter_column(
        "products",
        "brand",
        type_=sa.String(255),
        existing_type=sa.Text(),
        existing_nullable=True,
    )
    op.alter_column(
        "products",
        "summary",
        type_=sa.String(255),
        existing_type=sa.Text(),
        existing_nullable=True,
    )
    op.alter_column(
        "products",
        "key_actives",
        type_=sa.String(255),
        existing_type=sa.Text(),
        existing_nullable=True,
    )
