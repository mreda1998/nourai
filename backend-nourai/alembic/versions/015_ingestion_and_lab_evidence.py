"""Add scalable ingestion, product provenance, assets, and lab evidence.

Revision ID: 015
Revises: 014
Create Date: 2026-08-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB(astext_type=sa.Text())


def _id_column() -> sa.Column:
    return sa.Column(
        "id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")
    )


def _timestamps() -> tuple[sa.Column, sa.Column]:
    return (
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.add_column(
        "products",
        sa.Column("publication_status", sa.String(20), nullable=False, server_default="published"),
    )
    op.add_column("products", sa.Column("data_quality_score", sa.Float(), nullable=True))
    op.add_column("products", sa.Column("last_ingested_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_products_name_trgm",
        "products",
        ["name"],
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_products_brand_trgm",
        "products",
        ["brand"],
        postgresql_using="gin",
        postgresql_ops={"brand": "gin_trgm_ops"},
    )

    op.create_table(
        "data_sources",
        _id_column(),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("source_type", sa.String(40), nullable=False),
        sa.Column("base_url", sa.Text(), nullable=True),
        sa.Column("license_name", sa.String(120), nullable=True),
        sa.Column("license_url", sa.Text(), nullable=True),
        sa.Column("attribution_text", sa.Text(), nullable=True),
        sa.Column("share_alike", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("extra_data", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        *_timestamps(),
        sa.UniqueConstraint("slug", name="uq_data_sources_slug"),
    )

    op.create_table(
        "source_records",
        _id_column(),
        sa.Column("source_id", UUID, sa.ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=False),
        sa.Column("record_type", sa.String(50), nullable=False),
        sa.Column("schema_version", sa.String(50), nullable=True),
        sa.Column("request_url", sa.Text(), nullable=True),
        sa.Column("http_etag", sa.String(255), nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("payload", JSONB, nullable=True),
        sa.Column("payload_uri", sa.Text(), nullable=True),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("license_snapshot", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.UniqueConstraint("source_id", "record_type", "external_id", "content_hash", name="uq_source_record_snapshot"),
    )
    op.create_index("ix_source_records_source_external", "source_records", ["source_id", "external_id"])
    op.create_index("ix_source_records_fetched_at", "source_records", ["fetched_at"])

    op.create_table(
        "ingestion_jobs",
        _id_column(),
        sa.Column("job_type", sa.String(50), nullable=False),
        sa.Column("idempotency_key", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("payload", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("result", JSONB, nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_by", sa.String(120), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("source_record_id", UUID, sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("product_id", UUID, sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("idempotency_key", name="uq_ingestion_jobs_idempotency_key"),
    )
    op.create_index(
        "ix_ingestion_jobs_claim",
        "ingestion_jobs",
        ["status", "priority", "available_at"],
        postgresql_where=sa.text("status IN ('queued', 'retry', 'running')"),
    )
    op.create_index("ix_ingestion_jobs_product_id", "ingestion_jobs", ["product_id"])

    op.create_table(
        "product_identifiers",
        _id_column(),
        sa.Column("product_id", UUID, sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scheme", sa.String(30), nullable=False),
        sa.Column("value", sa.String(255), nullable=False),
        sa.Column("market_country", sa.String(2), nullable=False, server_default=""),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("scheme", "value", "market_country", name="uq_product_identifier"),
    )
    op.create_index("ix_product_identifiers_product_id", "product_identifiers", ["product_id"])

    op.create_table(
        "product_revisions",
        _id_column(),
        sa.Column("product_id", UUID, sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_record_id", UUID, sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("publication_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("market_country", sa.String(2), nullable=False, server_default=""),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("brand", sa.Text(), nullable=True),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("serving_size", sa.String(100), nullable=True),
        sa.Column("ingredient_statement", sa.Text(), nullable=True),
        sa.Column("normalized_data", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("field_provenance", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("quality_score", sa.Float(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("product_id", "revision_number", name="uq_product_revision_number"),
    )
    op.create_index("ix_product_revisions_product_hash", "product_revisions", ["product_id", "content_hash"])
    op.create_index("ix_product_revisions_product_current", "product_revisions", ["product_id", "is_current"])
    op.create_index(
        "uq_product_revisions_one_current",
        "product_revisions",
        ["product_id"],
        unique=True,
        postgresql_where=sa.text("is_current"),
    )
    op.create_index("ix_product_revisions_source_record", "product_revisions", ["source_record_id"])

    op.create_table(
        "product_ingredient_occurrences",
        _id_column(),
        sa.Column("product_revision_id", UUID, sa.ForeignKey("product_revisions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", UUID, sa.ForeignKey("product_ingredient_occurrences.id", ondelete="CASCADE"), nullable=True),
        sa.Column("ingredient_id", UUID, sa.ForeignKey("ingredients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("normalized_text", sa.Text(), nullable=False),
        sa.Column("order_path", sa.String(100), nullable=False),
        sa.Column("amount", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(30), nullable=True),
        sa.Column("percentage", sa.Float(), nullable=True),
        sa.Column("qualifiers", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("resolution_method", sa.String(40), nullable=True),
        sa.Column("resolution_confidence", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_product_ingredient_occurrences_revision", "product_ingredient_occurrences", ["product_revision_id"])
    op.create_index("ix_product_ingredient_occurrences_ingredient", "product_ingredient_occurrences", ["ingredient_id"])

    op.create_table(
        "product_assets",
        _id_column(),
        sa.Column("product_id", UUID, sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_revision_id", UUID, sa.ForeignKey("product_revisions.id", ondelete="CASCADE"), nullable=True),
        sa.Column("source_record_id", UUID, sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("asset_type", sa.String(30), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="evidence"),
        sa.Column("language", sa.String(10), nullable=False, server_default=""),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("original_storage_path", sa.Text(), nullable=True),
        sa.Column("derivative_storage_path", sa.Text(), nullable=True),
        sa.Column("public_url", sa.Text(), nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=True),
        sa.Column("perceptual_hash", sa.String(64), nullable=True),
        sa.Column("mime_type", sa.String(80), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("license_name", sa.String(120), nullable=True),
        sa.Column("license_url", sa.Text(), nullable=True),
        sa.Column("attribution_text", sa.Text(), nullable=True),
        sa.Column("is_original", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_ai_generated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("quality_score", sa.Float(), nullable=True),
        sa.Column("verification_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("processing_metadata", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        *_timestamps(),
    )
    op.create_index("ix_product_assets_product_type", "product_assets", ["product_id", "asset_type"])
    op.create_index("ix_product_assets_revision", "product_assets", ["product_revision_id"])

    op.create_table(
        "ingredient_aliases",
        _id_column(),
        sa.Column("ingredient_id", UUID, sa.ForeignKey("ingredients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("alias", sa.String(500), nullable=False),
        sa.Column("normalized_alias", sa.String(500), nullable=False),
        sa.Column("language", sa.String(10), nullable=False, server_default=""),
        sa.Column("market_country", sa.String(2), nullable=False, server_default=""),
        sa.Column("source_id", UUID, sa.ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True),
        sa.Column("alias_type", sa.String(30), nullable=False, server_default="synonym"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="1"),
        sa.Column("approved", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("ingredient_id", "normalized_alias", "language", "market_country", name="uq_ingredient_alias"),
    )
    op.create_index("ix_ingredient_aliases_normalized", "ingredient_aliases", ["normalized_alias"])

    op.create_table(
        "ingredient_external_identifiers",
        _id_column(),
        sa.Column("ingredient_id", UUID, sa.ForeignKey("ingredients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scheme", sa.String(40), nullable=False),
        sa.Column("value", sa.String(255), nullable=False),
        sa.Column("source_id", UUID, sa.ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("scheme", "value", name="uq_ingredient_external_identifier"),
    )
    op.create_index("ix_ingredient_external_identifiers_ingredient", "ingredient_external_identifiers", ["ingredient_id"])

    op.create_table(
        "quality_issues",
        _id_column(),
        sa.Column("product_revision_id", UUID, sa.ForeignKey("product_revisions.id", ondelete="CASCADE"), nullable=True),
        sa.Column("source_record_id", UUID, sa.ForeignKey("source_records.id", ondelete="CASCADE"), nullable=True),
        sa.Column("ingestion_job_id", UUID, sa.ForeignKey("ingestion_jobs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("field", sa.String(120), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("details", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        *_timestamps(),
    )
    op.create_index("ix_quality_issues_revision_status", "quality_issues", ["product_revision_id", "status"])
    op.create_index("ix_quality_issues_job", "quality_issues", ["ingestion_job_id"])

    op.create_table(
        "review_tasks",
        _id_column(),
        sa.Column("task_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", UUID, nullable=True),
        sa.Column("payload", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("resolution", JSONB, nullable=True),
        sa.Column("reviewed_by", sa.String(255), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_review_tasks_queue", "review_tasks", ["status", "priority", "created_at"])
    op.create_index("ix_review_tasks_entity", "review_tasks", ["entity_type", "entity_id"])

    op.create_table(
        "lab_datasets",
        _id_column(),
        sa.Column("source_id", UUID, sa.ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("publisher", sa.String(255), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("version", sa.String(80), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("license_name", sa.String(120), nullable=True),
        sa.Column("license_url", sa.Text(), nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=True),
        sa.Column("raw_asset_uri", sa.Text(), nullable=True),
        sa.Column("applicability", sa.String(30), nullable=False, server_default="product_specific"),
        sa.Column("trust_grade", sa.String(2), nullable=False, server_default="C"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("metadata_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        *_timestamps(),
        sa.UniqueConstraint("slug", name="uq_lab_datasets_slug"),
    )

    op.create_table(
        "lab_samples",
        _id_column(),
        sa.Column("dataset_id", UUID, sa.ForeignKey("lab_datasets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=False),
        sa.Column("product_id", UUID, sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("product_revision_id", UUID, sa.ForeignKey("product_revisions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ingredient_id", UUID, sa.ForeignKey("ingredients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("product_match_method", sa.String(40), nullable=True),
        sa.Column("product_match_confidence", sa.Float(), nullable=True),
        sa.Column("sample_name", sa.Text(), nullable=False),
        sa.Column("matrix", sa.String(120), nullable=True),
        sa.Column("gtin", sa.String(14), nullable=True),
        sa.Column("lot_number", sa.String(120), nullable=True),
        sa.Column("market_country", sa.String(2), nullable=False, server_default=""),
        sa.Column("purchase_location", sa.Text(), nullable=True),
        sa.Column("purchased_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expiration_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("preparation", sa.Text(), nullable=True),
        sa.Column("is_composite", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sample_metadata", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        *_timestamps(),
        sa.UniqueConstraint("dataset_id", "external_id", name="uq_lab_sample_external"),
    )
    op.create_index("ix_lab_samples_product", "lab_samples", ["product_id"])
    op.create_index("ix_lab_samples_gtin", "lab_samples", ["gtin"])

    op.create_table(
        "lab_analyses",
        _id_column(),
        sa.Column("sample_id", UUID, sa.ForeignKey("lab_samples.id", ondelete="CASCADE"), nullable=False),
        sa.Column("laboratory_name", sa.String(255), nullable=True),
        sa.Column("accreditation", sa.String(255), nullable=True),
        sa.Column("accreditation_scope", sa.Text(), nullable=True),
        sa.Column("method_name", sa.Text(), nullable=False),
        sa.Column("method_identifier", sa.String(120), nullable=True),
        sa.Column("instrument", sa.String(120), nullable=True),
        sa.Column("analyzed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("batch_identifier", sa.String(120), nullable=True),
        sa.Column("replicate_count", sa.Integer(), nullable=True),
        sa.Column("quality_control", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        *_timestamps(),
    )
    op.create_index("ix_lab_analyses_sample", "lab_analyses", ["sample_id"])

    op.create_table(
        "lab_observations",
        _id_column(),
        sa.Column("analysis_id", UUID, sa.ForeignKey("lab_analyses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("analyte_ingredient_id", UUID, sa.ForeignKey("ingredients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("analyte_name", sa.String(255), nullable=False),
        sa.Column("analyte_identifier_scheme", sa.String(40), nullable=True),
        sa.Column("analyte_identifier_value", sa.String(255), nullable=True),
        sa.Column("value", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(50), nullable=False),
        sa.Column("basis", sa.String(80), nullable=True),
        sa.Column("qualifier", sa.String(30), nullable=True),
        sa.Column("detection_status", sa.String(30), nullable=False, server_default="quantified"),
        sa.Column("lod", sa.Float(), nullable=True),
        sa.Column("loq", sa.Float(), nullable=True),
        sa.Column("uncertainty", sa.Float(), nullable=True),
        sa.Column("uncertainty_unit", sa.String(50), nullable=True),
        sa.Column("replicate_number", sa.Integer(), nullable=True),
        sa.Column("raw_value", sa.String(120), nullable=True),
        sa.Column("observation_metadata", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        *_timestamps(),
    )
    op.create_index("ix_lab_observations_analysis", "lab_observations", ["analysis_id"])
    op.create_index("ix_lab_observations_analyte", "lab_observations", ["analyte_ingredient_id", "analyte_name"])

    op.create_table(
        "lab_interpretations",
        _id_column(),
        sa.Column("observation_id", UUID, sa.ForeignKey("lab_observations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("jurisdiction", sa.String(20), nullable=True),
        sa.Column("population_context", sa.String(120), nullable=True),
        sa.Column("threshold_name", sa.String(255), nullable=True),
        sa.Column("threshold_source_url", sa.Text(), nullable=True),
        sa.Column("threshold_version", sa.String(80), nullable=True),
        sa.Column("threshold_value", sa.Float(), nullable=True),
        sa.Column("threshold_unit", sa.String(50), nullable=True),
        sa.Column("classification", sa.String(40), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("interpretation_version", sa.String(40), nullable=False, server_default="1"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_timestamps(),
    )
    op.create_index("ix_lab_interpretations_observation", "lab_interpretations", ["observation_id", "active"])

    # Existing product and ingredient data becomes immediately addressable by the
    # new resolver without changing the legacy read API.
    op.execute(
        """
        INSERT INTO data_sources
            (slug, name, source_type, base_url, license_name, license_url,
             attribution_text, share_alike, priority, enabled, extra_data)
        VALUES
            ('open-food-facts', 'Open Food Facts', 'product_catalog',
             'https://world.openfoodfacts.org', 'Open Database License',
             'https://opendatacommons.org/licenses/odbl/1-0/',
             'Data and images from Open Food Facts contributors', true, 50, true, '{}'::jsonb),
            ('usda-fooddata-central', 'USDA FoodData Central', 'product_catalog',
             'https://fdc.nal.usda.gov', 'Public Domain',
             'https://www.usa.gov/government-copyright',
             'U.S. Department of Agriculture, Agricultural Research Service', false, 60, true, '{}'::jsonb),
            ('manual', 'Elory editorial', 'manual', NULL, NULL, NULL,
             'Elory editorial data', false, 10, true, '{}'::jsonb)
        ON CONFLICT (slug) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO ingredient_aliases
            (ingredient_id, alias, normalized_alias, language, market_country,
             alias_type, confidence, approved)
        SELECT id, canonical_name,
               regexp_replace(lower(trim(canonical_name)), '\\s+', ' ', 'g'),
               '', '', 'canonical', 1.0, true
        FROM ingredients
        ON CONFLICT ON CONSTRAINT uq_ingredient_alias DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO ingredient_aliases
            (ingredient_id, alias, normalized_alias, language, market_country,
             alias_type, confidence, approved)
        SELECT i.id, synonym,
               regexp_replace(lower(trim(synonym)), '\\s+', ' ', 'g'),
               '', '', 'synonym', 1.0, true
        FROM ingredients i
        CROSS JOIN LATERAL jsonb_array_elements_text(i.synonyms) AS synonym
        WHERE trim(synonym) <> ''
        ON CONFLICT ON CONSTRAINT uq_ingredient_alias DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO product_identifiers (product_id, scheme, value, market_country, is_primary)
        WITH candidates AS (
            SELECT id, regexp_replace(barcode, '[^0-9]', '', 'g') AS digits
            FROM products
            WHERE barcode IS NOT NULL
        )
        SELECT id, 'gtin', lpad(digits, 14, '0'), '', true
        FROM candidates
        WHERE length(digits) IN (8, 12, 13, 14)
          AND right(digits, 1)::integer = (
              10 - (
                  SELECT sum(
                      substring(reverse(left(digits, length(digits) - 1)), digit_position, 1)::integer
                      * CASE WHEN digit_position % 2 = 1 THEN 3 ELSE 1 END
                  )
                  FROM generate_series(1, length(digits) - 1) AS positions(digit_position)
              ) % 10
          ) % 10
        ON CONFLICT ON CONSTRAINT uq_product_identifier DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_lab_interpretations_observation", table_name="lab_interpretations")
    op.drop_table("lab_interpretations")
    op.drop_index("ix_lab_observations_analyte", table_name="lab_observations")
    op.drop_index("ix_lab_observations_analysis", table_name="lab_observations")
    op.drop_table("lab_observations")
    op.drop_index("ix_lab_analyses_sample", table_name="lab_analyses")
    op.drop_table("lab_analyses")
    op.drop_index("ix_lab_samples_gtin", table_name="lab_samples")
    op.drop_index("ix_lab_samples_product", table_name="lab_samples")
    op.drop_table("lab_samples")
    op.drop_table("lab_datasets")
    op.drop_index("ix_review_tasks_entity", table_name="review_tasks")
    op.drop_index("ix_review_tasks_queue", table_name="review_tasks")
    op.drop_table("review_tasks")
    op.drop_index("ix_quality_issues_job", table_name="quality_issues")
    op.drop_index("ix_quality_issues_revision_status", table_name="quality_issues")
    op.drop_table("quality_issues")
    op.drop_index("ix_ingredient_external_identifiers_ingredient", table_name="ingredient_external_identifiers")
    op.drop_table("ingredient_external_identifiers")
    op.drop_index("ix_ingredient_aliases_normalized", table_name="ingredient_aliases")
    op.drop_table("ingredient_aliases")
    op.drop_index("ix_product_assets_revision", table_name="product_assets")
    op.drop_index("ix_product_assets_product_type", table_name="product_assets")
    op.drop_table("product_assets")
    op.drop_index("ix_product_ingredient_occurrences_ingredient", table_name="product_ingredient_occurrences")
    op.drop_index("ix_product_ingredient_occurrences_revision", table_name="product_ingredient_occurrences")
    op.drop_table("product_ingredient_occurrences")
    op.drop_index("ix_product_revisions_source_record", table_name="product_revisions")
    op.drop_index("uq_product_revisions_one_current", table_name="product_revisions")
    op.drop_index("ix_product_revisions_product_current", table_name="product_revisions")
    op.drop_index("ix_product_revisions_product_hash", table_name="product_revisions")
    op.drop_table("product_revisions")
    op.drop_index("ix_product_identifiers_product_id", table_name="product_identifiers")
    op.drop_table("product_identifiers")
    op.drop_index("ix_ingestion_jobs_product_id", table_name="ingestion_jobs")
    op.drop_index("ix_ingestion_jobs_claim", table_name="ingestion_jobs")
    op.drop_table("ingestion_jobs")
    op.drop_index("ix_source_records_fetched_at", table_name="source_records")
    op.drop_index("ix_source_records_source_external", table_name="source_records")
    op.drop_table("source_records")
    op.drop_table("data_sources")
    op.drop_index("ix_products_brand_trgm", table_name="products")
    op.drop_index("ix_products_name_trgm", table_name="products")
    op.drop_column("products", "last_ingested_at")
    op.drop_column("products", "data_quality_score")
    op.drop_column("products", "publication_status")
