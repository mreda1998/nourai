"""Add catalog_entries — a thin, bulk-loaded index of public product catalogs.

Revision ID: 018_catalog
Revises: 017
Create Date: 2026-10-07

The revision id is "018_catalog", not "018": an unmerged branch already uses
"018" (ingredient structure labels). Merging both needs an Alembic merge
revision; nothing in either depends on the other.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "018_catalog"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "catalog_entries",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("data_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("external_id", sa.String(64), nullable=False),
        sa.Column("gtin14", sa.String(14), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("brand", sa.Text(), nullable=True),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("countries", postgresql.ARRAY(sa.String(2)), nullable=False, server_default="{}"),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("search_text", sa.Text(), nullable=False),
        sa.Column("popularity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completeness", sa.Float(), nullable=True),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("imported_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.UniqueConstraint("source_id", "external_id", name="uq_catalog_entry_source_external"),
    )
    op.create_index("ix_catalog_entries_gtin14", "catalog_entries", ["gtin14"])
    op.create_index(
        "ix_catalog_entries_search_trgm",
        "catalog_entries",
        ["search_text"],
        postgresql_using="gin",
        postgresql_ops={"search_text": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_catalog_entries_category_popularity",
        "catalog_entries",
        ["category", sa.text("popularity DESC")],
    )
    op.create_index("ix_catalog_entries_product_id", "catalog_entries", ["product_id"])
    # Lets search walk the most popular matches first and stop at the window size.
    op.create_index("ix_catalog_entries_popularity", "catalog_entries", [sa.text("popularity DESC")])

    op.execute(
        """
        INSERT INTO data_sources
            (slug, name, source_type, base_url, license_name, license_url,
             attribution_text, share_alike, priority, enabled, extra_data)
        VALUES
            ('open-beauty-facts', 'Open Beauty Facts', 'product_catalog',
             'https://world.openbeautyfacts.org', 'Open Database License',
             'https://opendatacommons.org/licenses/odbl/1-0/',
             'Data and images from Open Beauty Facts contributors', true, 55, true, '{}'::jsonb)
        ON CONFLICT (slug) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_catalog_entries_popularity", table_name="catalog_entries")
    op.drop_index("ix_catalog_entries_product_id", table_name="catalog_entries")
    op.drop_index("ix_catalog_entries_category_popularity", table_name="catalog_entries")
    op.drop_index("ix_catalog_entries_search_trgm", table_name="catalog_entries")
    op.drop_index("ix_catalog_entries_gtin14", table_name="catalog_entries")
    op.drop_table("catalog_entries")
    op.execute("DELETE FROM data_sources WHERE slug = 'open-beauty-facts'")
