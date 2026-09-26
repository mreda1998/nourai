"""Ingredient identity: substances, aliases, name resolutions.

Revision ID: 019
Revises: 018
Create Date: 2026-09-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None

UUID = PG_UUID(as_uuid=True)


def _id() -> sa.Column:
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_table(
        "substances",
        _id(),
        sa.Column("key", sa.String(200), nullable=False, unique=True),
        sa.Column("name_en", sa.String(500), nullable=False),
        sa.Column("type", sa.String(20), nullable=False, server_default="substance"),
        sa.Column("e_number", sa.String(10), nullable=True, index=True),
        sa.Column("inci_name", sa.Text(), nullable=True),
        sa.Column("cas", sa.String(100), nullable=True),
        sa.Column("wikidata", sa.String(20), nullable=True, index=True),
        sa.Column("source", sa.String(40), nullable=False),
        sa.Column("license", sa.String(60), nullable=True),
        sa.Column("ingredient_id", UUID, sa.ForeignKey("ingredients.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "substance_aliases",
        _id(),
        sa.Column("substance_id", UUID, sa.ForeignKey("substances.id", ondelete="CASCADE"), nullable=False),
        sa.Column("alias", sa.Text(), nullable=False),
        sa.Column("normalized_alias", sa.Text(), nullable=False),
        sa.Column("language", sa.String(10), nullable=True),
        sa.Column("source", sa.String(40), nullable=False),
        sa.Column("method", sa.String(20), nullable=False, server_default="taxonomy"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="1"),
        sa.UniqueConstraint("normalized_alias", name="uq_substance_aliases_normalized"),
    )
    op.create_index("ix_substance_aliases_trgm", "substance_aliases", ["normalized_alias"],
                    postgresql_using="gin", postgresql_ops={"normalized_alias": "gin_trgm_ops"})
    op.create_table(
        "name_resolutions",
        _id(),
        sa.Column("normalized_name", sa.Text(), nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("substance_id", UUID, sa.ForeignKey("substances.id", ondelete="SET NULL"), nullable=True),
        sa.Column("english_name", sa.Text(), nullable=True),
        sa.Column("method", sa.String(20), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("model", sa.String(60), nullable=True),
        sa.Column("candidates", JSONB, nullable=True),
        sa.Column("occurrences", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.add_column("product_ingredients", sa.Column("substance_id", UUID, sa.ForeignKey("substances.id", ondelete="SET NULL"), nullable=True))
    op.add_column("product_ingredients", sa.Column("display_name", sa.Text(), nullable=True))
    op.create_index("ix_product_ingredients_substance_id", "product_ingredients", ["substance_id"])


def downgrade() -> None:
    op.drop_index("ix_product_ingredients_substance_id", "product_ingredients")
    op.drop_column("product_ingredients", "display_name")
    op.drop_column("product_ingredients", "substance_id")
    op.drop_table("name_resolutions")
    op.drop_table("substance_aliases")
    op.drop_table("substances")
