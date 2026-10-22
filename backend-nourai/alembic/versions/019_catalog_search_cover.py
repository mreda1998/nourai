"""Covering popularity indexes so catalog search can walk matches without reading the table.

Revision ID: 019_catalog_search
Revises: 018_catalog
Create Date: 2026-10-22

Common words ("chocolate": ~94k of 3.5M entries) are found fastest by walking the
popularity index until the window is full. Without search_text in the index every
step of that walk reads a table page, which took 2.7 s on production's small cache.
Including it (plus source_id for the enabled-source join, and id to fetch the rows)
makes the walk an index-only scan.

Built CONCURRENTLY so hydration's writes to the catalog aren't blocked during the build.
The revision id is "019_catalog_search", not "019": an unmerged branch already uses "019".
"""
from alembic import op

revision = "019_catalog_search"
down_revision = "018_catalog"
branch_labels = None
depends_on = None

_INCLUDE = "INCLUDE (search_text, source_id, id)"


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_catalog_entries_popularity_cover "
            f"ON catalog_entries (popularity DESC) {_INCLUDE}"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_catalog_entries_category_popularity_cover "
            f"ON catalog_entries (category, popularity DESC) {_INCLUDE}"
        )
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_catalog_entries_popularity")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_catalog_entries_category_popularity")


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_catalog_entries_popularity "
            "ON catalog_entries (popularity DESC)"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_catalog_entries_category_popularity "
            "ON catalog_entries (category, popularity DESC)"
        )
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_catalog_entries_popularity_cover")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_catalog_entries_category_popularity_cover")
