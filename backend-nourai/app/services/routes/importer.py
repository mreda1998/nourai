"""
Import reviewed route files as immutable, versioned rows.

A route file that hasn't changed since its last published version is left
alone; a changed file becomes the next version, and the previous one is
retired (kept for the public change history, never edited).
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingredient import Ingredient, IngredientRole
from app.models.pathway import (
    IngredientMechanismAsset,
    PathwayRoute,
    RouteClaim,
    RouteLink,
    RouteNode,
    RouteStatus,
)
from app.services.bio_entities import SOURCES, ensure_source, get_or_create_entity
from app.services.routes.schema import RouteFile

PublishedSummary = tuple[int, str]  # (version, content_hash)


@dataclass(frozen=True)
class ImportAction:
    kind: Literal["create", "new_version", "unchanged"]
    version: int


def content_hash(route: RouteFile) -> str:
    canonical = json.dumps(route.model_dump(mode="json", by_alias=True), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def plan_import(route: RouteFile, latest: PublishedSummary | None) -> ImportAction:
    if latest is None:
        return ImportAction("create", 1)
    version, digest = latest
    if digest == content_hash(route):
        return ImportAction("unchanged", version)
    return ImportAction("new_version", version + 1)


class RouteImportError(Exception):
    pass


async def _ingredient(session: AsyncSession, name: str) -> Ingredient | None:
    return (await session.execute(
        select(Ingredient).where(func.lower(Ingredient.canonical_name) == name.lower())
    )).scalar_one_or_none()


async def apply_route(
    session: AsyncSession,
    route: RouteFile,
    *,
    reviewer: str,
    commit: str | None,
    source_path: str,
    dry_run: bool = False,
) -> ImportAction:
    ingredient = await _ingredient(session, route.ingredient)
    if ingredient is None:
        if route.create_if_missing is None:
            raise RouteImportError(f"{route.slug}: ingredient '{route.ingredient}' not in the library")
        seed = route.create_if_missing
        ingredient = Ingredient(canonical_name=seed.canonical_name, category=seed.category, synonyms=seed.synonyms)
        session.add(ingredient)
        await session.flush()

    latest = (await session.execute(
        select(PathwayRoute).where(PathwayRoute.slug == route.slug).order_by(PathwayRoute.version.desc()).limit(1)
    )).scalar_one_or_none()
    action = plan_import(route, (latest.version, latest.content_hash) if latest else None)
    if dry_run or action.kind == "unchanged":
        return action

    ingredient.role = IngredientRole.ACTIVE.value
    for form_name in route.forms:
        form = await _ingredient(session, form_name)
        if form is None:
            raise RouteImportError(f"{route.slug}: form '{form_name}' not in the library")
        form.active_moiety_id = ingredient.id
        if form.role == IngredientRole.UNKNOWN.value:
            form.role = IngredientRole.ACTIVE.value

    now = datetime.now(timezone.utc)
    row = PathwayRoute(
        slug=route.slug, version=action.version, ingredient_id=ingredient.id,
        title=route.title, takeaway=route.takeaway.strip(), domain=route.domain, direction=route.direction,
        status=RouteStatus.PUBLISHED.value, reviewed_by=reviewer, reviewed_at=now, published_at=now,
        supersedes_id=latest.id if latest else None, source_path=source_path, source_commit=commit,
        content_hash=content_hash(route),
    )
    if latest is not None:
        latest.status = RouteStatus.RETIRED.value

    chebi = await ensure_source(session, "chebi")
    reactome = await ensure_source(session, "reactome")
    uniprot = await ensure_source(session, "uniprot")
    for position, node in enumerate(route.nodes):
        entity = None
        if node.chebi:
            entity = await get_or_create_entity(session, kind="small_molecule", name=node.label,
                                                source_id=chebi.id, chebi_id=node.chebi.removeprefix("CHEBI:"))
        elif node.uniprot:
            entity = await get_or_create_entity(session, kind="protein", name=node.label,
                                                source_id=uniprot.id, uniprot_id=node.uniprot)
        elif node.reactome:
            entity = await get_or_create_entity(session, kind="process", name=node.label,
                                                source_id=reactome.id, reactome_id=node.reactome)
        row.nodes.append(RouteNode(
            key=node.id, position=position, label=node.label, plain_label=node.plain_label,
            node_role=node.role, bio_entity_id=entity.id if entity else None,
        ))

    for position, link in enumerate(route.links):
        link_row = RouteLink(
            position=position, from_key=link.from_, to_key=link.to, relation_text=link.relation_text,
            evidence_type=link.evidence_type, strength=link.strength,
            evidence_stops_here=link.evidence_stops_here, stop_reason=link.stop_reason,
        )
        for claim_position, c in enumerate(link.claims):
            link_row.claims.append(RouteClaim(
                position=claim_position, claim_text=c.claim_text, population=c.population,
                comparator=c.comparator, duration=c.duration, form=c.form,
                dose_low=c.dose.low if c.dose else None, dose_high=c.dose.high if c.dose else None,
                dose_unit=c.dose.unit if c.dose else None, dose_basis=c.dose.basis if c.dose else None,
                outcome_measure=c.outcome_measure,
                effect_estimate=c.effect.estimate if c.effect else None,
                ci_low=c.effect.ci[0] if c.effect and c.effect.ci else None,
                ci_high=c.effect.ci[1] if c.effect and c.effect.ci else None,
                effect_unit=c.effect.unit if c.effect else None,
                certainty=c.certainty, limitations=c.limitations,
                citations=[x.model_dump(exclude_none=True) for x in c.citations],
                drafted_by=c.drafted_by,
            ))
        row.links.append(link_row)
    session.add(row)

    if route.structure:
        await _pin_structure(session, ingredient.id, route)
    await session.flush()
    return action


async def _pin_structure(session: AsyncSession, ingredient_id, route: RouteFile) -> None:
    """A reviewed structure choice overrides the automatic one."""
    s = route.structure
    asset = (await session.execute(
        select(IngredientMechanismAsset).where(
            IngredientMechanismAsset.ingredient_id == ingredient_id,
            IngredientMechanismAsset.kind == "structure",
        )
    )).scalar_one_or_none()
    payload = {"pdb_id": s.pdb.upper(), "ligand": s.ligand.upper(), "title": s.target}
    if asset is None:
        asset = IngredientMechanismAsset(ingredient_id=ingredient_id, kind="structure")
        session.add(asset)
    asset.payload = payload
    asset.reviewed = True
    asset.cached_uri = f"https://cdn.rcsb.org/images/structures/{s.pdb.lower()}_assembly-1.jpeg"
    asset.attribution = SOURCES["rcsb-pdb"]["attribution_text"]
