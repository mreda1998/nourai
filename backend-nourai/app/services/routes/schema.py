"""
The route file format (`content/routes/<slug>.yaml`) and its structural rules.

`validate_route` only checks the file against itself. Whether citations and
identifiers are real is `checks.py`'s job.
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

NodeRole = Literal["input", "mechanism", "outcome", "boundary"]
EvidenceType = Literal[
    "meta_analysis", "human_rct", "human_observational", "preclinical",
    "established_biochemistry", "proposed",
]
Strength = Literal["strong", "moderate", "limited", "insufficient"]
CERTAINTY = {"high", "moderate", "low", "very_low"}

# Evidence types that describe a measured human result.
HUMAN_EVIDENCE = {"meta_analysis", "human_rct", "human_observational"}
# A mechanism alone can at most make an outcome look "limited".
MECHANISM_ONLY = {"established_biochemistry", "proposed"}


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class CitationSpec(_Model):
    pmid: str | None = None
    doi: str | None = None
    url: str | None = None


class DoseSpec(_Model):
    low: float
    high: float
    unit: str
    basis: str = "per_day"


class EffectSpec(_Model):
    estimate: float | None = None
    ci: list[float] | None = None
    unit: str | None = None


class ClaimSpec(_Model):
    claim_text: str
    population: str | None = None
    comparator: str | None = None
    duration: str | None = None
    form: str | None = None
    dose: DoseSpec | None = None
    outcome_measure: str | None = None
    effect: EffectSpec | None = None
    certainty: str | None = None
    limitations: str | None = None
    citations: list[CitationSpec] = Field(default_factory=list)
    drafted_by: Literal["ai", "human"] = "human"


class NodeSpec(_Model):
    id: str
    role: NodeRole
    label: str
    plain_label: str | None = None
    chebi: str | None = None
    reactome: str | None = None
    uniprot: str | None = None


class LinkSpec(_Model):
    from_: str = Field(alias="from")
    to: str
    relation_text: str | None = None
    evidence_type: EvidenceType | None = None
    strength: Strength | None = None
    evidence_stops_here: bool = False
    stop_reason: str | None = None
    claims: list[ClaimSpec] = Field(default_factory=list)


class StructureSpec(_Model):
    pdb: str
    ligand: str
    target: str | None = None


class IngredientSeed(_Model):
    canonical_name: str
    category: str = "other"
    synonyms: list[str] = Field(default_factory=list)


class RouteFile(_Model):
    slug: str
    ingredient: str
    create_if_missing: IngredientSeed | None = None
    forms: list[str] = Field(default_factory=list)
    domain: str | None = None
    # What the measured outcome means for the person: the evidence grid cell.
    direction: Literal["supports", "mixed", "risk"] = "supports"
    title: str
    takeaway: str
    structure: StructureSpec | None = None
    nodes: list[NodeSpec]
    links: list[LinkSpec]


def load_route(path: Path) -> RouteFile:
    return RouteFile.model_validate(yaml.safe_load(Path(path).read_text()))


def validate_route(route: RouteFile) -> list[str]:
    """Structural problems with a route; an empty list means valid."""
    errors: list[str] = []
    roles: dict[str, str] = {}
    for node in route.nodes:
        if node.id in roles:
            errors.append(f"node id '{node.id}' is used twice")
        roles[node.id] = node.role

    for i, link in enumerate(route.links):
        where = f"link {i} ({link.from_} → {link.to})"
        for end in (link.from_, link.to):
            if end not in roles:
                errors.append(f"{where}: unknown node '{end}'")

        if link.evidence_stops_here:
            if not (link.stop_reason or "").strip():
                errors.append(f"{where}: evidence_stops_here needs a stop_reason")
            continue

        if not link.evidence_type or not link.strength:
            errors.append(f"{where}: needs evidence_type and strength")

        if roles.get(link.to) == "outcome":
            if link.evidence_type in MECHANISM_ONLY and link.strength not in ("limited", "insufficient"):
                errors.append(
                    f"{where}: a mechanism alone can't support an outcome above 'limited' strength"
                )
            if not link.claims:
                errors.append(f"{where}: an outcome link needs at least one claim")

        for j, claim in enumerate(link.claims):
            errors.extend(f"{where} claim {j}: {e}" for e in _claim_errors(claim))

    return errors


def _claim_errors(claim: ClaimSpec) -> list[str]:
    errors = []
    if not claim.citations or not any(c.pmid or c.doi or c.url for c in claim.citations):
        errors.append("needs at least one citation")
    if claim.certainty is not None and claim.certainty not in CERTAINTY:
        errors.append(f"certainty must be one of {sorted(CERTAINTY)}")
    if claim.effect and claim.effect.ci is not None:
        ci = claim.effect.ci
        if len(ci) != 2 or ci[0] > ci[1]:
            errors.append("effect ci must be [low, high]")
    if claim.dose and claim.dose.low > claim.dose.high:
        errors.append("dose low must not exceed high")
    return errors
