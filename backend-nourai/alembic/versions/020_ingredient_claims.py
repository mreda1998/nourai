"""Ingredient claims with verdicts, and how each study was done.

Revision ID: 020_ingredient_claims
Revises: 019_catalog_search
Create Date: 2026-10-24

Research is organised around what consumers believe an ingredient does
(`ingredient_claims`), each judged from the studies that test it
(`ingredient_claim_evidence`). `ingredient_evidence` gains the study's
appraisal: method, dose, duration, outcome type, a quality score and the
caveat flags readers see. Legacy evidence columns stay for older app builds.

RLS is enabled on the new tables like every public table in production: the
app's public Supabase key must not read them; the backend reads as owner.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "020_ingredient_claims"
down_revision = "019_catalog_search"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ingredient_claims",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "ingredient_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ingredients.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("claim", sa.Text(), nullable=False),
        sa.Column("why_people_believe", sa.Text(), nullable=True),
        sa.Column("search_terms", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("verdict", sa.String(20), nullable=True),
        sa.Column("certainty", sa.String(20), nullable=True),
        sa.Column("certainty_reasons", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("reality", sa.Text(), nullable=True),
        sa.Column("effect_size", sa.Text(), nullable=True),
        sa.Column("applies_to", sa.Text(), nullable=True),
        sa.Column("avoid_if", sa.Text(), nullable=True),
        sa.Column("dose_note", sa.Text(), nullable=True),
        sa.Column("key_pmids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("study_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ingredient_claims_ingredient_id", "ingredient_claims", ["ingredient_id"])

    op.create_table(
        "ingredient_claim_evidence",
        sa.Column(
            "claim_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ingredient_claims.id", ondelete="CASCADE"), primary_key=True,
        ),
        sa.Column(
            "evidence_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ingredient_evidence.id", ondelete="CASCADE"), primary_key=True,
        ),
        sa.Column("stance", sa.String(20), nullable=False),
        sa.Column("relevance", sa.String(20), nullable=False),
    )
    op.create_index("ix_ingredient_claim_evidence_evidence_id", "ingredient_claim_evidence", ["evidence_id"])

    with op.batch_alter_table("ingredient_evidence") as batch:
        batch.add_column(sa.Column("appraisal", postgresql.JSONB(), nullable=True))
        batch.add_column(sa.Column("method_summary", sa.Text(), nullable=True))
        batch.add_column(sa.Column("caveat", sa.Text(), nullable=True))
        batch.add_column(sa.Column("quality_score", sa.Float(), nullable=True))
        batch.add_column(sa.Column("quality_tier", sa.String(20), nullable=True))
        batch.add_column(sa.Column("quality_flags", postgresql.JSONB(), nullable=False, server_default="[]"))
        batch.add_column(sa.Column("intervention_form", sa.String(200), nullable=True))
        batch.add_column(sa.Column("dose_amount", sa.Float(), nullable=True))
        batch.add_column(sa.Column("dose_unit", sa.String(30), nullable=True))
        batch.add_column(sa.Column("dose_frequency", sa.String(60), nullable=True))
        batch.add_column(sa.Column("duration_weeks", sa.Float(), nullable=True))
        batch.add_column(sa.Column("outcome_type", sa.String(30), nullable=True))

    op.execute("ALTER TABLE ingredient_claims ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE ingredient_claim_evidence ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    with op.batch_alter_table("ingredient_evidence") as batch:
        for column in (
            "outcome_type", "duration_weeks", "dose_frequency", "dose_unit", "dose_amount",
            "intervention_form", "quality_flags", "quality_tier", "quality_score", "caveat",
            "method_summary", "appraisal",
        ):
            batch.drop_column(column)
    op.drop_index("ix_ingredient_claim_evidence_evidence_id", table_name="ingredient_claim_evidence")
    op.drop_table("ingredient_claim_evidence")
    op.drop_index("ix_ingredient_claims_ingredient_id", table_name="ingredient_claims")
    op.drop_table("ingredient_claims")
