from sqlalchemy import UniqueConstraint

import app.models  # noqa: F401
from app.db.base import Base


def test_pathway_tables_registered():
    for t in ["bio_entities", "mechanism_facts", "ingredient_mechanism_assets",
              "pathway_routes", "route_nodes", "route_links", "route_claims"]:
        assert t in Base.metadata.tables


def test_ingredient_has_role_and_moiety():
    cols = Base.metadata.tables["ingredients"].c
    for c in ["active_moiety_id", "form_note", "role", "function_summary"]:
        assert c in cols


def test_route_versions_unique_per_slug():
    t = Base.metadata.tables["pathway_routes"]
    uniques = [{c.name for c in con.columns} for con in t.constraints if isinstance(con, UniqueConstraint)]
    assert {"slug", "version"} in uniques
    assert "content_hash" in t.c
