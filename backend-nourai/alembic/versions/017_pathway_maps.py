"""Pathway maps: mechanism facts, viewer assets and reviewed routes.

Revision ID: 017
Revises: 016
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None

UUID = PG_UUID(as_uuid=True)


def _id() -> sa.Column:
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def _fk(name: str, target: str, *, nullable: bool = False, ondelete: str = "CASCADE") -> sa.Column:
    return sa.Column(name, UUID, sa.ForeignKey(target, ondelete=ondelete), nullable=nullable)


def upgrade() -> None:
    op.add_column("ingredients", _fk("active_moiety_id", "ingredients.id", nullable=True, ondelete="SET NULL"))
    op.add_column("ingredients", sa.Column("form_note", sa.Text(), nullable=True))
    op.add_column("ingredients", sa.Column("role", sa.String(20), nullable=False, server_default="unknown"))
    op.add_column("ingredients", sa.Column("function_summary", sa.Text(), nullable=True))

    op.create_table(
        "bio_entities",
        _id(),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("plain_name", sa.String(500), nullable=True),
        sa.Column("chebi_id", sa.String(20), nullable=True, index=True),
        sa.Column("pubchem_cid", sa.String(20), nullable=True),
        sa.Column("uniprot_id", sa.String(20), nullable=True, index=True),
        sa.Column("reactome_id", sa.String(30), nullable=True, index=True),
        sa.Column("go_id", sa.String(20), nullable=True),
        sa.Column("uniprot_sl_id", sa.String(10), nullable=True),
        _fk("source_id", "data_sources.id", nullable=True, ondelete="SET NULL"),
        *_timestamps(),
        sa.UniqueConstraint("kind", "name", name="uq_bio_entities_kind_name"),
    )

    op.create_table(
        "mechanism_facts",
        _id(),
        _fk("subject_id", "bio_entities.id"),
        sa.Column("relation", sa.String(30), nullable=False),
        _fk("object_id", "bio_entities.id"),
        _fk("source_id", "data_sources.id"),
        sa.Column("source_reference", sa.Text(), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("subject_id", "relation", "object_id", "source_id", name="uq_mechanism_facts"),
    )
    op.create_index("ix_mechanism_facts_subject", "mechanism_facts", ["subject_id"])

    op.create_table(
        "ingredient_mechanism_assets",
        _id(),
        _fk("ingredient_id", "ingredients.id"),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("payload", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("cached_uri", sa.Text(), nullable=True),
        sa.Column("attribution", sa.Text(), nullable=True),
        sa.Column("reviewed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("ingredient_id", "kind", name="uq_ingredient_mechanism_assets"),
    )

    op.create_table(
        "pathway_routes",
        _id(),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        _fk("ingredient_id", "ingredients.id"),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("takeaway", sa.Text(), nullable=False),
        sa.Column("domain", sa.String(50), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("reviewed_by", sa.String(255), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        _fk("supersedes_id", "pathway_routes.id", nullable=True, ondelete="SET NULL"),
        sa.Column("source_path", sa.Text(), nullable=True),
        sa.Column("source_commit", sa.String(64), nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("slug", "version", name="uq_pathway_routes_slug_version"),
    )
    op.create_index("ix_pathway_routes_ingredient_status", "pathway_routes", ["ingredient_id", "status"])

    op.create_table(
        "route_nodes",
        _id(),
        _fk("route_id", "pathway_routes.id"),
        sa.Column("key", sa.String(60), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        _fk("bio_entity_id", "bio_entities.id", nullable=True, ondelete="SET NULL"),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("plain_label", sa.String(255), nullable=True),
        sa.Column("node_role", sa.String(20), nullable=False),
    )

    op.create_table(
        "route_links",
        _id(),
        _fk("route_id", "pathway_routes.id"),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("from_key", sa.String(60), nullable=False),
        sa.Column("to_key", sa.String(60), nullable=False),
        sa.Column("relation_text", sa.Text(), nullable=True),
        sa.Column("evidence_type", sa.String(30), nullable=True),
        sa.Column("strength", sa.String(20), nullable=True),
        sa.Column("evidence_stops_here", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("stop_reason", sa.Text(), nullable=True),
    )

    op.create_table(
        "route_claims",
        _id(),
        _fk("link_id", "route_links.id"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("claim_text", sa.Text(), nullable=False),
        sa.Column("population", sa.Text(), nullable=True),
        sa.Column("comparator", sa.Text(), nullable=True),
        sa.Column("duration", sa.Text(), nullable=True),
        sa.Column("form", sa.Text(), nullable=True),
        sa.Column("dose_low", sa.Float(), nullable=True),
        sa.Column("dose_high", sa.Float(), nullable=True),
        sa.Column("dose_unit", sa.String(20), nullable=True),
        sa.Column("dose_basis", sa.String(20), nullable=True),
        sa.Column("outcome_measure", sa.Text(), nullable=True),
        sa.Column("effect_estimate", sa.Float(), nullable=True),
        sa.Column("ci_low", sa.Float(), nullable=True),
        sa.Column("ci_high", sa.Float(), nullable=True),
        sa.Column("effect_unit", sa.String(40), nullable=True),
        sa.Column("certainty", sa.String(20), nullable=True),
        sa.Column("limitations", sa.Text(), nullable=True),
        sa.Column("citations", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("checks", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("drafted_by", sa.String(10), nullable=False, server_default="human"),
    )


def downgrade() -> None:
    for table in ["route_claims", "route_links", "route_nodes", "pathway_routes",
                  "ingredient_mechanism_assets", "mechanism_facts", "bio_entities"]:
        op.drop_table(table)
    for column in ["function_summary", "role", "form_note", "active_moiety_id"]:
        op.drop_column("ingredients", column)
