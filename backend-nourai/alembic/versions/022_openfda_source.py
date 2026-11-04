"""openFDA as a catalog source: US over-the-counter personal care by UPC.

Revision ID: 022_openfda_source
Revises: 021_catalog_region
Create Date: 2026-11-04
"""
from alembic import op

revision = "022_openfda_source"
down_revision = "021_catalog_region"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO data_sources
            (slug, name, source_type, base_url, license_name, license_url,
             attribution_text, share_alike, priority, enabled, extra_data)
        VALUES
            ('openfda', 'openFDA', 'product_catalog', 'https://open.fda.gov',
             'Public Domain (CC0 1.0)', 'https://open.fda.gov/license/',
             'U.S. Food and Drug Administration, openFDA', false, 65, true, '{}'::jsonb)
        ON CONFLICT (slug) DO UPDATE SET enabled = true
        """
    )


def downgrade() -> None:
    # Products ingested from openFDA keep their provenance: disable the source then.
    op.execute(
        """
        DELETE FROM data_sources d WHERE d.slug = 'openfda'
          AND NOT EXISTS (SELECT 1 FROM source_records s WHERE s.source_id = d.id)
        """
    )
    op.execute("UPDATE data_sources SET enabled = false WHERE slug = 'openfda'")
