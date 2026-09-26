"""Fill ingredients.smiles (drawn structures) and reader-facing class labels.

SMILES come from the curated table in generate_ingredient_structures.py
first, then from PubChem — only on an exact name/synonym match, and never for
herbs, probiotics, enzymes or blends, where one structure would be misleading.

Usage:
  python scripts/fill_molecules.py [--dry-run]
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx  # noqa: E402
from rdkit import Chem  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.db.session import async_session_factory  # noqa: E402
from app.models.ingredient import Ingredient  # noqa: E402
from app.services.molecule import molecule_facts  # noqa: E402
from scripts.generate_ingredient_structures import SMILES_BY_NAME  # noqa: E402

# Where the coarse category would mislead a reader.
CLASS_LABELS: dict[str, str] = {
    "Creatine": "Amino acid derivative",
    "Creatine Monohydrate": "Amino acid derivative",
    "L-Carnitine": "Amino acid derivative",
    "Taurine": "Amino sulfonic acid",
    "Branched-Chain Amino Acids": "Amino acid blend",
    "Beta-Alanine": "Beta amino acid",
}

NO_SINGLE_STRUCTURE = {"herb", "probiotic", "enzyme"}

# Never drawn: one molecule would misrepresent the ingredient.
EXCLUDE: dict[str, str] = {
    "Branched-Chain Amino Acids": "a blend of leucine, isoleucine and valine",
    "Parabens": "a class of preservatives, not one molecule",
    "Lecithin": "a mixture of phospholipids",
    "Ceramide": "a family of lipids",
    "Carmine": "an aluminium lake of carminic acid, not the free acid",
    "Salicylate": "the curated SMILES is aspirin, a different molecule",
}
NOT_A_MOLECULE_WORDS = ("extract", "protein", "blend", "complex", "powder", "oil", "husk", "peptides", "acids")


async def pubchem_smiles(client: httpx.AsyncClient, name: str) -> str | None:
    base = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{quote(name)}"
    try:
        syn = (await client.get(f"{base}/synonyms/JSON")).json()
        synonyms = syn["InformationList"]["Information"][0].get("Synonym", [])
        if name.lower() not in {s.lower() for s in synonyms}:
            return None  # PubChem matched something, but not this exact name
        props = (await client.get(f"{base}/property/IsomericSMILES,SMILES/JSON")).json()
        row = props["PropertyTable"]["Properties"][0]
        return row.get("IsomericSMILES") or row.get("SMILES")
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return None


async def run(dry_run: bool) -> None:
    async with async_session_factory() as session, httpx.AsyncClient(timeout=20) as client:
        ingredients = (await session.execute(select(Ingredient).order_by(Ingredient.canonical_name))).scalars().all()
        drawn = labelled = 0
        for ing in ingredients:
            label = CLASS_LABELS.get(ing.canonical_name)
            if label and ing.class_label != label:
                ing.class_label = label
                labelled += 1

            if ing.smiles or ing.canonical_name in EXCLUDE:
                continue
            category = getattr(ing.category, "value", ing.category)
            smiles = SMILES_BY_NAME.get(ing.canonical_name)
            source = "curated"
            # Peptide short names ("KPV") collide with unrelated compounds on PubChem.
            if not smiles and category not in NO_SINGLE_STRUCTURE | {"peptide"} and not any(
                w in ing.canonical_name.lower() for w in NOT_A_MOLECULE_WORDS
            ):
                smiles, source = await pubchem_smiles(client, ing.canonical_name), "PubChem"
            mol = Chem.MolFromSmiles(smiles) if smiles else None
            if mol is None or mol.GetNumHeavyAtoms() < 2:
                continue  # a lone "Mg" isn't a structure worth drawing
            if molecule_facts(smiles):
                ing.smiles = smiles
                drawn += 1
                print(f"✓ {ing.canonical_name}: {source} · {molecule_facts(smiles)['formula']}")
        print(f"\n{drawn} structures added · {labelled} class labels set")
        if dry_run:
            await session.rollback()
            print("[DRY RUN — nothing written]")
        else:
            await session.commit()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    asyncio.run(run(parser.parse_args().dry_run))


if __name__ == "__main__":
    main()
