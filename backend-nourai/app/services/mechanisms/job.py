"""
Layer 3: build an active compound's mechanism panels from open databases.

`build_mechanism` is pure given its clients (tested against recordings);
`persist_mechanism` writes the result. Nothing here produces wording or an
outcome claim — only database facts, each traceable to its source record.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingestion import IngredientExternalIdentifier
from app.models.ingredient import Ingredient
from app.models.pathway import IngredientMechanismAsset, MechanismFact
from app.services.bio_entities import SOURCES, ensure_source, get_or_create_entity
from app.services.mechanisms.clients import MechanismClients

MAX_PROTEINS = 12
MAX_LOCATIONS = 6

# Ligand codes that appear in crystal structures as crystallisation or
# cryoprotection additives, buffers or ions — their presence says nothing
# about biology, so they never become a "see it bind" structure.
CRYSTALLISATION_ADDITIVES = frozenset({
    "GOL", "EDO", "PEG", "PGE", "PG4", "1PE", "P6G", "MPD", "DMS", "ACT", "ACY", "FMT",
    "CIT", "FLC", "TRS", "EPE", "MES", "BME", "IPA", "EOH", "MOH", "SO4", "PO4", "CL",
    "NA", "MG", "ZN", "CA", "K", "IOD", "NO3", "IMD", "TLA", "MLI", "SIN", "BU3",
})


@dataclass
class MechanismResult:
    name: str
    chebi_id: str | None = None
    chebi_forms: list[str] = field(default_factory=list)
    pathways: list[tuple[str, str]] = field(default_factory=list)
    ehld: tuple[str, str] | None = None               # (illustrated pathway, region to highlight)
    proteins: list[tuple[str, str]] = field(default_factory=list)
    sl_ids: list[str] = field(default_factory=list)
    sl_names: dict[str, str] = field(default_factory=dict)
    structure: dict | None = None
    facts: list[tuple[str, str, str, str, str]] = field(default_factory=list)  # (subject, relation, object, source, ref)

    @property
    def found_anything(self) -> bool:
        return bool(self.pathways or self.sl_ids or self.structure)


def build_mechanism(
    name: str, clients: MechanismClients, *, extra_pathways: list[tuple[str, str]] | None = None
) -> MechanismResult:
    result = MechanismResult(name=name)

    # 1. Exact identity: PubChem name → ChEBI, plus ChEBI's tautomer/conjugate forms.
    try:
        ids = clients.chebi_ids_for_name(name)
    except Exception:
        ids = []
    forms: list[str] = []
    for chebi in ids:
        forms.append(chebi)
        try:
            forms.extend(clients.chebi_related_forms(chebi))
        except Exception:
            pass
    result.chebi_id = ids[0] if ids else None
    result.chebi_forms = list(dict.fromkeys(forms))

    # 2. Pathways containing any of those exact forms.
    pathways: list[tuple[str, str]] = list(extra_pathways or [])
    for chebi in result.chebi_forms:
        try:
            pathways.extend(clients.reactome_pathways(chebi))
        except Exception:
            continue
    result.pathways = list(dict.fromkeys(pathways))
    for st_id, pname in result.pathways:
        result.facts.append((name, "participates_in", pname, "reactome", st_id))

    if result.pathways:
        first = result.pathways[0][0]
        # 3. Nearest illustrated ancestor, highlighting the branch we sit in.
        try:
            for path in clients.reactome_ancestors(first):
                for i, (st_id, _pname, has_ehld) in enumerate(path):
                    if has_ehld and i > 0:
                        result.ehld = (st_id, path[i - 1][0])
                        break
                if result.ehld:
                    break
        except Exception:
            pass

        # 4. Proteins in the pathway and where they sit in the cell.
        try:
            result.proteins = clients.reactome_proteins(first)[:MAX_PROTEINS]
        except Exception:
            result.proteins = []
        counts: Counter[str] = Counter()
        for acc, gene in result.proteins:
            result.facts.append((gene, "participates_in", result.pathways[0][1], "reactome", first))
            try:
                locations = clients.uniprot_locations(acc)
            except Exception:
                continue
            for sl_id, sl_name in locations:
                counts[sl_id] += 1
                result.sl_names[sl_id] = sl_name
                result.facts.append((gene, "located_in", sl_name, "uniprot", acc))
        result.sl_ids = [sl for sl, _ in counts.most_common(MAX_LOCATIONS)]

    # 5. A human structure with the molecule bound.
    for chebi in result.chebi_forms:
        try:
            comp = clients.rcsb_ligand(chebi)
            if comp in CRYSTALLISATION_ADDITIVES:
                break
            entry = clients.rcsb_best_human_entry(comp) if comp else None
        except Exception:
            entry = None
        if entry:
            result.structure = {"pdb_id": entry[0], "ligand": comp, "title": entry[1]}
            break

    return result


async def persist_mechanism(session: AsyncSession, ingredient: Ingredient, result: MechanismResult) -> None:
    sources = {slug: await ensure_source(session, slug) for slug in
               ("reactome", "reactome-illustrations", "uniprot", "swissbiopics", "rcsb-pdb", "chebi")}

    if result.chebi_id:
        existing = (await session.execute(select(IngredientExternalIdentifier).where(
            IngredientExternalIdentifier.scheme == "chebi",
            IngredientExternalIdentifier.value == result.chebi_id,
        ))).scalar_one_or_none()
        if existing is None:
            session.add(IngredientExternalIdentifier(
                ingredient_id=ingredient.id, scheme="chebi", value=result.chebi_id, source_id=sources["chebi"].id,
            ))

    subject = await get_or_create_entity(
        session, kind="small_molecule", name=ingredient.canonical_name,
        source_id=sources["chebi"].id, chebi_id=result.chebi_id,
    )
    for subj_name, relation, obj_name, source, ref in result.facts:
        subj = subject if subj_name == result.name else await get_or_create_entity(
            session, kind="protein", name=subj_name, source_id=sources["uniprot"].id)
        kind = "cell_location" if relation == "located_in" else "process"
        obj = await get_or_create_entity(session, kind=kind, name=obj_name, source_id=sources[source].id)
        exists = (await session.execute(select(MechanismFact.id).where(
            MechanismFact.subject_id == subj.id, MechanismFact.relation == relation,
            MechanismFact.object_id == obj.id, MechanismFact.source_id == sources[source].id,
        ))).first()
        if not exists:
            session.add(MechanismFact(subject_id=subj.id, relation=relation, object_id=obj.id,
                                      source_id=sources[source].id, source_reference=ref))

    async def upsert(kind: str, payload: dict, cached_uri: str | None, attribution: str) -> None:
        asset = (await session.execute(select(IngredientMechanismAsset).where(
            IngredientMechanismAsset.ingredient_id == ingredient.id, IngredientMechanismAsset.kind == kind,
        ))).scalar_one_or_none()
        if asset is not None and asset.reviewed:
            return  # a reviewer's choice beats the automatic one
        if asset is None:
            asset = IngredientMechanismAsset(ingredient_id=ingredient.id, kind=kind)
            session.add(asset)
        asset.payload, asset.cached_uri, asset.attribution = payload, cached_uri, attribution

    # Automatic assets the sources no longer support are removed; reviewed ones stay.
    found = {
        "cell_locations": bool(result.sl_ids), "pathway_illustration": bool(result.ehld),
        "pathway_diagram": bool(result.pathways), "structure": bool(result.structure),
    }
    stale = (await session.execute(select(IngredientMechanismAsset).where(
        IngredientMechanismAsset.ingredient_id == ingredient.id,
        IngredientMechanismAsset.kind.in_([k for k, ok in found.items() if not ok]),
        IngredientMechanismAsset.reviewed.is_(False),
    ))).scalars().all()
    for asset in stale:
        await session.delete(asset)

    if result.sl_ids:
        await upsert("cell_locations",
                     {"sls": result.sl_ids, "names": [result.sl_names[s] for s in result.sl_ids],
                      "proteins": [g for _, g in result.proteins]},
                     None, SOURCES["swissbiopics"]["attribution_text"] + " · " + SOURCES["uniprot"]["attribution_text"])
    if result.ehld:
        await upsert("pathway_illustration", {"ehld": result.ehld[0], "highlight": result.ehld[1]},
                     f"https://reactome.org/download/current/ehld/{result.ehld[0]}.svg",
                     SOURCES["reactome-illustrations"]["attribution_text"])
    if result.pathways:
        st_id, pname = result.pathways[0]
        await upsert("pathway_diagram", {"reactome": st_id, "name": pname},
                     f"https://reactome.org/ContentService/exporter/diagram/{st_id}.png?quality=7",
                     SOURCES["reactome-illustrations"]["attribution_text"])
    if result.structure:
        pdb = result.structure["pdb_id"].lower()
        await upsert("structure", result.structure,
                     f"https://cdn.rcsb.org/images/structures/{pdb}_assembly-1.jpeg",
                     SOURCES["rcsb-pdb"]["attribution_text"])
    await session.flush()
