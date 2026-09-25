"""Responses for pathway maps: routes, mechanism panels, product evidence."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import quote, urlencode

from pydantic import BaseModel, Field

HUMAN_EVIDENCE = {"meta_analysis", "human_rct", "human_observational"}
STRENGTH_ORDER = ["insufficient", "limited", "moderate", "strong"]


class ClaimOut(BaseModel):
    claim_text: str
    population: str | None = None
    comparator: str | None = None
    duration: str | None = None
    form: str | None = None
    dose_low: float | None = None
    dose_high: float | None = None
    dose_unit: str | None = None
    dose_basis: str | None = None
    outcome_measure: str | None = None
    effect_estimate: float | None = None
    ci_low: float | None = None
    ci_high: float | None = None
    effect_unit: str | None = None
    certainty: str | None = None
    limitations: str | None = None
    citations: list[dict] = Field(default_factory=list)
    drafted_by: str = "human"


class NodeOut(BaseModel):
    id: str
    label: str
    plain_label: str | None = None
    role: str


class LinkOut(BaseModel):
    from_: str = Field(serialization_alias="from")
    to: str
    relation_text: str | None = None
    evidence_type: str | None = None
    strength: str | None = None
    human_evidence: bool
    evidence_stops_here: bool
    stop_reason: str | None = None
    claims: list[ClaimOut] = Field(default_factory=list)


class RouteOut(BaseModel):
    slug: str
    version: int
    title: str
    takeaway: str
    domain: str | None = None
    direction: str
    reviewed_by: str | None = None
    published_at: datetime | None = None
    nodes: list[NodeOut]
    links: list[LinkOut]


class AssetOut(BaseModel):
    kind: str
    payload: dict[str, Any]
    viewer_path: str | None = None
    fallback_url: str | None = None
    attribution: str | None = None
    reviewed: bool = False


class MechanismOut(BaseModel):
    ingredient_id: str
    name: str
    level: str
    via_moiety: str | None = None
    form_note: str | None = None
    function_summary: str | None = None
    route: RouteOut | None = None
    assets: list[AssetOut] = Field(default_factory=list)
    facts_count: int = 0


class GridRowOut(BaseModel):
    compound: str
    ingredient_id: str
    level: str
    cells: dict[str, dict]


class GridOut(BaseModel):
    columns: list[str]
    rows: list[GridRowOut]


class DoseBarOut(BaseModel):
    compound: str
    route_slug: str
    outcome: str | None = None
    studied_low: float
    studied_high: float
    unit_label: str
    upper_limit_value: float | None = None
    amount_value: float | None = None
    amount_note: str | None = None


class ProductEvidenceOut(BaseModel):
    grid: GridOut
    dose_bars: list[DoseBarOut] = Field(default_factory=list)


# ── Serialisers (pure; take ORM rows or anything with the same attributes) ───

def route_out(route) -> RouteOut:
    nodes = sorted(route.nodes, key=lambda n: n.position)
    links = sorted(route.links, key=lambda link: link.position)
    return RouteOut(
        slug=route.slug, version=route.version, title=route.title, takeaway=route.takeaway,
        domain=route.domain, direction=route.direction, reviewed_by=route.reviewed_by,
        published_at=route.published_at,
        nodes=[NodeOut(id=n.key, label=n.label, plain_label=n.plain_label, role=n.node_role) for n in nodes],
        links=[
            LinkOut(
                from_=link.from_key, to=link.to_key, relation_text=link.relation_text,
                evidence_type=link.evidence_type, strength=link.strength,
                human_evidence=link.evidence_type in HUMAN_EVIDENCE,
                evidence_stops_here=link.evidence_stops_here, stop_reason=link.stop_reason,
                claims=[
                    ClaimOut(**{f: getattr(c, f) for f in ClaimOut.model_fields})
                    for c in sorted(link.claims, key=lambda c: c.position)
                ],
            )
            for link in links
        ],
    )


def outcome_strength(route) -> str | None:
    """Strongest evidence strength among links that reach an outcome node."""
    outcomes = {n.key for n in route.nodes if n.node_role == "outcome"}
    strengths = [
        link.strength for link in route.links
        if link.to_key in outcomes and not link.evidence_stops_here and link.strength
    ]
    return max(strengths, key=STRENGTH_ORDER.index) if strengths else None


def viewer_path(kind: str, payload: dict) -> str | None:
    if kind == "cell_locations" and payload.get("sls"):
        return "/viewers/cell?" + urlencode({"sls": ",".join(payload["sls"])})
    if kind == "structure" and payload.get("pdb_id"):
        return "/viewers/structure?" + urlencode({"pdb": payload["pdb_id"], "ligand": payload.get("ligand") or ""})
    if kind == "pathway_illustration" and payload.get("ehld"):
        return "/viewers/pathway?" + urlencode({"ehld": payload["ehld"], "highlight": payload.get("highlight") or ""})
    return None


def asset_out(asset) -> AssetOut:
    return AssetOut(
        kind=asset.kind,
        payload=asset.payload or {},
        viewer_path=viewer_path(asset.kind, asset.payload or {}),
        fallback_url=f"/viewers/image?url={quote(asset.cached_uri, safe='')}" if asset.cached_uri else None,
        attribution=asset.attribution,
        reviewed=bool(asset.reviewed),
    )
