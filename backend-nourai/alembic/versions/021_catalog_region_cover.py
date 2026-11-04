"""Covering popularity indexes also carry countries, so search can walk one region's matches.

Revision ID: 021_catalog_region
Revises: 020_ingredient_claims
Create Date: 2026-11-04

Popularity in the dumps is Open Food Facts scans, which are mostly French: the
60 most popular "shampoo" matches were all French, so a US device never saw a US
shampoo. Search now also walks the matches sold in the user's country. Without
countries in the index every step of that walk read a table page ("shampoo" in
the US: 1.1 s); with it the walk stays index-only like the global one.

Production has ~3.6M catalog rows, so build these out of band first (one statement
at a time, outside a transaction) and let this migration find them already there;
a deploy's healthcheck would not wait for the build.
"""
from alembic import op

revision = "021_catalog_region"
down_revision = "020_ingredient_claims"
branch_labels = None
depends_on = None

_INCLUDE = "INCLUDE (search_text, source_id, id, countries)"
_OLD_INCLUDE = "INCLUDE (search_text, source_id, id)"


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_catalog_entries_popularity_region "
            f"ON catalog_entries (popularity DESC) {_INCLUDE}"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_catalog_entries_category_popularity_region "
            f"ON catalog_entries (category, popularity DESC) {_INCLUDE}"
        )
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_catalog_entries_popularity_cover")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_catalog_entries_category_popularity_cover")


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_catalog_entries_popularity_cover "
            f"ON catalog_entries (popularity DESC) {_OLD_INCLUDE}"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_catalog_entries_category_popularity_cover "
            f"ON catalog_entries (category, popularity DESC) {_OLD_INCLUDE}"
        )
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_catalog_entries_popularity_region")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_catalog_entries_category_popularity_region")
