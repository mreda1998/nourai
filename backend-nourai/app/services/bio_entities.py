"""Find-or-create helpers shared by the route importer and the mechanism job."""
from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingestion import DataSource
from app.models.pathway import BioEntity

# Open sources the pathway features rely on. Share-alike sources are excluded.
SOURCES: dict[str, dict] = {
    "reactome": {
        "name": "Reactome", "source_type": "pathway_database", "base_url": "https://reactome.org",
        "license_name": "CC0 1.0", "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "attribution_text": "Pathway data: Reactome (reactome.org)",
    },
    "reactome-illustrations": {
        "name": "Reactome pathway illustrations", "source_type": "pathway_illustration",
        "base_url": "https://reactome.org", "license_name": "CC BY 4.0",
        "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "attribution_text": "Illustration: Reactome (reactome.org), CC BY 4.0",
    },
    "uniprot": {
        "name": "UniProt", "source_type": "protein_database", "base_url": "https://www.uniprot.org",
        "license_name": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "attribution_text": "Protein locations: UniProt, CC BY 4.0",
    },
    "swissbiopics": {
        "name": "SwissBioPics", "source_type": "cell_illustration", "base_url": "https://www.swissbiopics.org",
        "license_name": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "attribution_text": "Cell image: SwissBioPics, SIB Swiss Institute of Bioinformatics, CC BY 4.0",
    },
    "rcsb-pdb": {
        "name": "RCSB Protein Data Bank", "source_type": "structure_database", "base_url": "https://www.rcsb.org",
        "license_name": "Public domain (CC0)", "license_url": "https://www.rcsb.org/pages/usage-policy",
        "attribution_text": "Structure: RCSB PDB (rcsb.org), viewed with Mol*",
    },
    "chebi": {
        "name": "ChEBI", "source_type": "chemical_database", "base_url": "https://www.ebi.ac.uk/chebi",
        "license_name": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "attribution_text": "Chemical identity: ChEBI, CC BY 4.0",
    },
    "elory-routes": {
        "name": "Elory reviewed routes", "source_type": "editorial",
        "license_name": "Proprietary", "attribution_text": "Reviewed by Elory",
    },
}


async def ensure_source(session: AsyncSession, slug: str) -> DataSource:
    existing = (await session.execute(select(DataSource).where(DataSource.slug == slug))).scalar_one_or_none()
    if existing:
        return existing
    source = DataSource(slug=slug, **SOURCES[slug])
    session.add(source)
    await session.flush()
    return source


async def get_or_create_entity(
    session: AsyncSession,
    *,
    kind: str,
    name: str,
    source_id=None,
    **ids: str | None,
) -> BioEntity:
    """Match on any given external id first, then on (kind, name)."""
    ids = {k: v for k, v in ids.items() if v}
    conditions = [getattr(BioEntity, k) == v for k, v in ids.items()]
    found = None
    if conditions:
        found = (await session.execute(select(BioEntity).where(or_(*conditions)).limit(1))).scalar_one_or_none()
    if found is None:
        found = (await session.execute(
            select(BioEntity).where(BioEntity.kind == kind, BioEntity.name == name)
        )).scalar_one_or_none()
    if found is None:
        found = BioEntity(kind=kind, name=name, source_id=source_id, **ids)
        session.add(found)
        await session.flush()
    else:
        for k, v in ids.items():
            if getattr(found, k) is None:
                setattr(found, k, v)
    return found
