"""Assemble the pathway API responses from the repository and pure view logic."""
from __future__ import annotations

import uuid

from app.repositories.pathway import PathwayRepository
from app.schemas.pathway import (
    DoseBarOut,
    GridOut,
    GridRowOut,
    MechanismOut,
    ProductEvidenceOut,
    asset_out,
    outcome_strength,
    route_out,
)
from app.services.evidence_views import dose_bar, evidence_grid, ladder_level


async def ingredient_mechanism(repo: PathwayRepository, ingredient_id: uuid.UUID) -> MechanismOut | None:
    ingredient = await repo.ingredient(ingredient_id)
    if ingredient is None:
        return None
    compound = await repo.compound_for(ingredient)
    routes = await repo.published_routes([compound.id])
    assets = (await repo.assets([compound.id]))[compound.id]
    level = ladder_level(
        has_published_route=bool(routes), has_mechanism=bool(assets),
        role=ingredient.role, function_summary=ingredient.function_summary,
    )
    return MechanismOut(
        ingredient_id=str(ingredient.id),
        name=ingredient.canonical_name,
        level=level,
        via_moiety=compound.canonical_name if compound.id != ingredient.id else None,
        form_note=ingredient.form_note,
        function_summary=ingredient.function_summary,
        route=route_out(routes[0]) if routes else None,
        assets=[asset_out(a) for a in sorted(assets, key=lambda a: a.kind)],
        facts_count=await repo.facts_count(compound.id),
    )


async def product_evidence(repo: PathwayRepository, product_id: uuid.UUID) -> ProductEvidenceOut:
    rows = await repo.product_ingredients(product_id)

    # One entry per active compound present; the first label row supplies the amount.
    compounds: dict[uuid.UUID, tuple] = {}
    for pi in rows:
        compound = await repo.compound_for(pi.ingredient)
        compounds.setdefault(compound.id, (compound, pi))

    ids = list(compounds)
    routes = await repo.published_routes(ids)
    assets = await repo.assets(ids)
    routes_by_compound: dict[uuid.UUID, list] = {i: [] for i in ids}
    for r in routes:
        routes_by_compound[r.ingredient_id].append(r)

    grid_input, id_by_name, dose_bars = [], {}, []
    for cid, (compound, pi) in compounds.items():
        level = ladder_level(
            has_published_route=bool(routes_by_compound[cid]), has_mechanism=bool(assets[cid]),
            role=compound.role, function_summary=compound.function_summary,
        )
        if level not in ("reviewed", "mechanism") and compound.role != "active":
            continue  # the grid is about active compounds
        published = [
            (r.domain, r.direction, outcome_strength(r) or "limited")
            for r in routes_by_compound[cid] if r.domain
        ]
        grid_input.append((compound.canonical_name, level, published))
        id_by_name[compound.canonical_name] = str(cid)

        for r in routes_by_compound[cid]:
            claim = next((c for link in r.links for c in link.claims if c.dose_low is not None), None)
            if claim is None:
                continue
            bar = dose_bar(
                studied_low=claim.dose_low, studied_high=claim.dose_high, studied_unit=claim.dose_unit,
                upper_limit=compound.upper_limit, amount=pi.amount, amount_unit=pi.unit,
            )
            dose_bars.append(DoseBarOut(compound=compound.canonical_name, route_slug=r.slug,
                                        outcome=claim.outcome_measure, **bar.__dict__))

    grid = evidence_grid(grid_input)
    return ProductEvidenceOut(
        grid=GridOut(
            columns=grid.columns,
            rows=[GridRowOut(compound=g.compound, ingredient_id=id_by_name[g.compound], level=g.level, cells=g.cells)
                  for g in grid.rows],
        ),
        dose_bars=dose_bars,
    )
