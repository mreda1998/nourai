"""Add tester_events and product_submissions for tester insights.

Revision ID: 017
Revises: 016
Create Date: 2026-09-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tester_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("device_id", sa.String(64), nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user_profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("barcode", sa.String(32), nullable=True),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("query", sa.String(200), nullable=True),
        sa.Column("meta", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("app_version", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tester_events_device_id", "tester_events", ["device_id"])
    op.create_index("ix_tester_events_barcode", "tester_events", ["barcode"])
    op.create_index("ix_tester_events_type_created", "tester_events", ["event_type", "created_at"])

    op.create_table(
        "product_submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("device_id", sa.String(64), nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user_profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("barcode", sa.String(32), nullable=True),
        sa.Column("name", sa.String(300), nullable=True),
        sa.Column("brand", sa.String(200), nullable=True),
        sa.Column("category", sa.String(32), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("photo_paths", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("status", sa.String(16), nullable=False, server_default="new"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_product_submissions_device_created", "product_submissions", ["device_id", "created_at"])
    op.create_index("ix_product_submissions_barcode", "product_submissions", ["barcode"])


def downgrade() -> None:
    op.drop_index("ix_product_submissions_barcode", table_name="product_submissions")
    op.drop_index("ix_product_submissions_device_created", table_name="product_submissions")
    op.drop_table("product_submissions")
    op.drop_index("ix_tester_events_type_created", table_name="tester_events")
    op.drop_index("ix_tester_events_barcode", table_name="tester_events")
    op.drop_index("ix_tester_events_device_id", table_name="tester_events")
    op.drop_table("tester_events")
