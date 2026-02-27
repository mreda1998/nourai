"""Initial schema with Supabase auth and subscriptions

Revision ID: 001
Revises:
Create Date: 2026-01-27

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create products table
    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("barcode", sa.String(20), unique=True, nullable=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("brand", sa.String(255), nullable=True),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("subcategory", sa.String(100), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("summary", sa.String(255), nullable=True),
        sa.Column("serving_size", sa.String(100), nullable=True),
        sa.Column("servings_per_container", sa.Integer(), nullable=True),
        sa.Column("usage", sa.Text(), nullable=True),
        sa.Column("key_actives", sa.String(255), nullable=True),
        sa.Column("price", sa.String(50), nullable=True),
        sa.Column("health_score", sa.Integer(), nullable=True),
        sa.Column("sugar", sa.String(50), nullable=True),
        sa.Column("marketing_claims", postgresql.JSONB(), nullable=True),
        sa.Column("scientific_support", postgresql.JSONB(), nullable=True),
        sa.Column("regulatory_allowances", postgresql.JSONB(), nullable=True),
        sa.Column("disclaimers", postgresql.JSONB(), nullable=True),
        sa.Column("extra_data", postgresql.JSONB(), nullable=False, server_default="{}"),
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
    op.create_index("ix_products_health_score", "products", ["health_score"])
    op.create_index("ix_products_category", "products", ["category"])

    # Create ingredients table
    op.create_table(
        "ingredients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "canonical_name", sa.String(255), unique=True, nullable=False, index=True
        ),
        sa.Column("category", sa.String(20), nullable=False, server_default="other"),
        sa.Column("synonyms", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("mechanism_summary", sa.Text(), nullable=True),
        sa.Column("typical_dose_range", sa.String(100), nullable=True),
        sa.Column("recommended_daily", sa.String(100), nullable=True),
        sa.Column("upper_limit", sa.String(100), nullable=True),
        sa.Column(
            "side_effects", postgresql.JSONB(), nullable=False, server_default="[]"
        ),
        sa.Column(
            "contraindications", postgresql.JSONB(), nullable=False, server_default="[]"
        ),
        sa.Column(
            "drug_interactions", postgresql.JSONB(), nullable=False, server_default="[]"
        ),
        sa.Column("evidence_level", sa.String(50), nullable=True),
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

    # Create product_ingredients junction table
    op.create_table(
        "product_ingredients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "ingredient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ingredients.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=True),
        sa.Column("amount", sa.String(50), nullable=True),
        sa.Column("unit", sa.String(20), nullable=True),
        sa.Column("percentage", sa.Float(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("order_position", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_product_ingredients_product_id", "product_ingredients", ["product_id"]
    )
    op.create_index(
        "ix_product_ingredients_ingredient_id", "product_ingredients", ["ingredient_id"]
    )

    # Create claims table
    op.create_table(
        "claims",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("normalized_claim", sa.Text(), nullable=True),
        sa.Column(
            "evidence_strength", sa.String(20), nullable=False, server_default="insufficient"
        ),
        sa.Column("mechanism_summary", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("accent", sa.String(10), nullable=True),
        sa.Column("tags", postgresql.JSONB(), nullable=False, server_default="[]"),
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
    op.create_index("ix_claims_product_id", "claims", ["product_id"])

    # Create claim_sources table
    op.create_table(
        "claim_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "claim_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("claims.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("study_type", sa.String(50), nullable=True),
        sa.Column("pmid", sa.String(20), nullable=True),
        sa.Column("doi", sa.String(100), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
    )
    op.create_index("ix_claim_sources_claim_id", "claim_sources", ["claim_id"])

    # Create user_profiles table
    op.create_table(
        "user_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "supabase_id", sa.String(255), unique=True, nullable=False, index=True
        ),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("biological_sex", sa.String(10), nullable=True),
        sa.Column("birth_year", sa.Integer(), nullable=True),
        sa.Column("allergies", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("conditions", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column(
            "medications", postgresql.JSONB(), nullable=False, server_default="[]"
        ),
        sa.Column(
            "dietary_preferences", postgresql.JSONB(), nullable=False, server_default="[]"
        ),
        sa.Column(
            "health_goals", postgresql.JSONB(), nullable=False, server_default="[]"
        ),
        sa.Column(
            "notification_preferences",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "onboarding_completed", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.Column("onboarding_step", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
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

    # Create user_stack_entries table
    op.create_table(
        "user_stack_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("time_of_day", sa.String(20), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("unit", sa.String(20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_user_stack_entries_user_id", "user_stack_entries", ["user_id"]
    )
    op.create_index(
        "ix_user_stack_entries_logged_at", "user_stack_entries", ["logged_at"]
    )
    op.create_index(
        "ix_user_stack_entries_user_logged",
        "user_stack_entries",
        ["user_id", "logged_at"],
    )

    # Create subscriptions table
    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user_profiles.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        sa.Column("tier", sa.String(20), nullable=False, server_default="free"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("store", sa.String(20), nullable=True),
        sa.Column("store_transaction_id", sa.String(255), nullable=True),
        sa.Column("revenuecat_id", sa.String(255), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
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
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])
    op.create_index("ix_subscriptions_status", "subscriptions", ["status"])
    op.create_index("ix_subscriptions_expires_at", "subscriptions", ["expires_at"])


def downgrade() -> None:
    op.drop_table("subscriptions")
    op.drop_table("user_stack_entries")
    op.drop_table("user_profiles")
    op.drop_table("claim_sources")
    op.drop_table("claims")
    op.drop_table("product_ingredients")
    op.drop_table("ingredients")
    op.drop_table("products")
