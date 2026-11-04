"""What the law and expert bodies say about each substance, place by place.

Revision ID: 023_regulatory_rules
Revises: 022_openfda_source
Create Date: 2026-11-04

A substance (`regulated_substances`) is the thing a rule is about, kept apart from the curated
research library and linked to it many-to-many (`ingredient_substances`). Labels match substances
through `regulated_substance_aliases`. `regulatory_rules` holds one rule per substance × place ×
scope × instrument, with its official source; only published rules are served. `rule_checks`
records places we checked and found nothing specific, so "no rule" never reads as "allowed".

RLS is enabled on the new tables like every public table in production: the app's public Supabase
key must not read them; the backend reads as owner.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "023_regulatory_rules"
down_revision = "022_openfda_source"
branch_labels = None
depends_on = None

_TABLES = (
    "regulated_substances", "regulated_substance_aliases", "ingredient_substances",
    "regulatory_rules", "rule_checks",
)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def _substance_fk(**kw) -> sa.Column:
    return sa.Column(
        "substance_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("regulated_substances.id", ondelete="CASCADE"), nullable=False, **kw,
    )


def _source_fk() -> sa.Column:
    return sa.Column(
        "source_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True,
    )


def upgrade() -> None:
    op.create_table(
        "regulated_substances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("e_number", sa.String(12), nullable=True),
        sa.Column("cas", sa.String(20), nullable=True),
        sa.Column("ec", sa.String(20), nullable=True),
        sa.Column("inci", sa.Text(), nullable=True),
        sa.Column("unii", sa.String(12), nullable=True),
        sa.Column("identifiers", postgresql.JSONB(), nullable=False, server_default="{}"),
        *_timestamps(),
    )
    op.create_index(
        "uq_regulated_substances_e_number", "regulated_substances", ["e_number"], unique=True,
        postgresql_where=sa.text("e_number IS NOT NULL"),
    )
    op.create_index("ix_regulated_substances_cas", "regulated_substances", ["cas"])

    op.create_table(
        "regulated_substance_aliases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _substance_fk(),
        sa.Column("alias", sa.String(500), nullable=False),
        sa.Column("normalized_alias", sa.String(500), nullable=False),
        sa.Column("alias_type", sa.String(20), nullable=False, server_default="name"),
        sa.Column("language", sa.String(10), nullable=False, server_default=""),
        _source_fk(),
        sa.Column("approved", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("substance_id", "normalized_alias", name="uq_substance_alias"),
    )
    op.create_index(
        "ix_regulated_substance_aliases_normalized", "regulated_substance_aliases", ["normalized_alias"]
    )

    op.create_table(
        "ingredient_substances",
        sa.Column(
            "ingredient_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ingredients.id", ondelete="CASCADE"), primary_key=True,
        ),
        _substance_fk(primary_key=True),
        sa.Column("scope_label", sa.Text(), nullable=True),
    )
    op.create_index("ix_ingredient_substances_substance_id", "ingredient_substances", ["substance_id"])

    op.create_table(
        "regulatory_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _substance_fk(),
        sa.Column("place", sa.String(8), nullable=False),
        sa.Column("authority", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("classification", sa.String(80), nullable=True),
        sa.Column("applies_to", sa.String(16), nullable=True),
        sa.Column("sub_scope", sa.Text(), nullable=True),
        sa.Column("condition", sa.Text(), nullable=True),
        sa.Column("limit_value", sa.Float(), nullable=True),
        sa.Column("limit_unit", sa.String(30), nullable=True),
        sa.Column("limit_basis", sa.String(60), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=True),
        sa.Column("effective_until", sa.Date(), nullable=True),
        sa.Column("legal_reference", sa.Text(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=False),
        _source_fk(),
        sa.Column(
            "source_record_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("source_quote", sa.Text(), nullable=True),
        sa.Column("why", sa.Text(), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("origin", sa.String(10), nullable=False),
        sa.Column("review_status", sa.String(12), nullable=False, server_default="draft"),
        sa.Column("reviewed_by", sa.String(120), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column(
            "supersedes_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("regulatory_rules.id", ondelete="SET NULL"), nullable=True,
        ),
        *_timestamps(),
        sa.CheckConstraint("kind = 'expert_view' OR applies_to IS NOT NULL", name="ck_regulatory_rules_scope"),
    )
    op.create_index(
        "ix_regulatory_rules_substance_status", "regulatory_rules", ["substance_id", "review_status"]
    )
    op.create_index("ix_regulatory_rules_place", "regulatory_rules", ["place"])

    op.create_table(
        "rule_checks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _substance_fk(),
        sa.Column("place", sa.String(8), nullable=False),
        sa.Column("applies_to", sa.String(16), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("origin", sa.String(10), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="confirmed"),
        _source_fk(),
        sa.Column("documents", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("reviewed_by", sa.String(120), nullable=True),
        sa.UniqueConstraint("substance_id", "place", "applies_to", name="uq_rule_checks_place_scope"),
    )

    for table in _TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in reversed(_TABLES):
        op.drop_table(table)
