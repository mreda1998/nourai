from types import SimpleNamespace as NS

from app.schemas.pathway import asset_out, outcome_strength, route_out, viewer_path


def _route():
    claim = NS(position=0, claim_text="Lean mass up", population="Older adults", comparator=None, duration=None,
               form=None, dose_low=3.0, dose_high=5.0, dose_unit="g", dose_basis="per_day",
               outcome_measure="Lean tissue mass", effect_estimate=1.37, ci_low=0.97, ci_high=1.76,
               effect_unit="kg", certainty="moderate", limitations=None,
               citations=[{"pmid": "29138605"}], drafted_by="human")
    nodes = [NS(key="lean", position=2, label="Lean mass", plain_label=None, node_role="outcome"),
             NS(key="dose", position=0, label="Creatine", plain_label=None, node_role="input"),
             NS(key="pcr", position=1, label="Phosphocreatine", plain_label=None, node_role="mechanism")]
    links = [NS(position=1, from_key="pcr", to_key="lean", relation_text=None, evidence_type="meta_analysis",
                strength="moderate", evidence_stops_here=False, stop_reason=None, claims=[claim]),
             NS(position=0, from_key="dose", to_key="pcr", relation_text=None,
                evidence_type="established_biochemistry", strength="strong", evidence_stops_here=False,
                stop_reason=None, claims=[])]
    return NS(slug="creatine", version=2, title="T", takeaway="K", domain="body_composition", direction="supports",
              reviewed_by="Reda", published_at=None, nodes=nodes, links=links)


def test_route_out_orders_nodes_and_links_by_position():
    out = route_out(_route())
    assert [n.id for n in out.nodes] == ["dose", "pcr", "lean"]
    assert [link.from_ for link in out.links] == ["dose", "pcr"]
    assert out.links[1].human_evidence and not out.links[0].human_evidence
    assert out.links[1].claims[0].ci_high == 1.76


def test_route_out_serialises_from_key_as_from():
    dumped = route_out(_route()).model_dump(by_alias=True)
    assert dumped["links"][0]["from"] == "dose"


def test_outcome_strength_ignores_mechanism_links():
    assert outcome_strength(_route()) == "moderate"


def test_viewer_paths():
    assert viewer_path("cell_locations", {"sls": ["SL-0086", "SL-0173"]}) == "/viewers/cell?sls=SL-0086%2CSL-0173"
    assert viewer_path("structure", {"pdb_id": "5MZP", "ligand": "CFF"}) == "/viewers/structure?pdb=5MZP&ligand=CFF"
    assert viewer_path("pathway_diagram", {"reactome": "R-HSA-71288"}) is None


def test_asset_fallback_goes_through_our_image_cache():
    a = asset_out(NS(kind="structure", payload={"pdb_id": "5MZP", "ligand": "CFF"}, reviewed=True,
                     cached_uri="https://cdn.rcsb.org/images/structures/5mzp_assembly-1.jpeg", attribution="RCSB"))
    assert a.fallback_url.startswith("/viewers/image?url=https%3A%2F%2Fcdn.rcsb.org")


def test_paths_registered():
    from app.main import app
    paths = {r.path for r in app.routes}
    assert "/api/v1/routes/{slug}" in paths
    assert "/api/v1/ingredients/{ingredient_id}/mechanism" in paths
    assert "/api/v1/products/{product_id}/evidence" in paths
