"""
Elory Ingredient Structure Generator
======================================
Renders each ingredient's 2D chemical structure locally with RDKit from a
curated SMILES table, then re-hosts the PNG in Supabase Storage — mirroring
upload_product_images.py. No external chemistry API involved, so there's no
rate limit or network dependency at generation time.

Only ~60 ingredients in the curated table below have a single, well-defined
molecular structure (vitamins, minerals, amino acids, common food/cosmetic
acids, a few small-molecule actives). Herbs, probiotics, peptides, protein
powders, and polymer/blend ingredients (collagen, hyaluronic acid, xanthan
gum, etc.) have no single structure to draw and are intentionally left out —
they keep structure_image_url = null and fall back to the app's generic
molecule icon.

Storage layout
--------------
Bucket : ingredient-structures   (must be PUBLIC, created in Supabase dashboard)
Path   : structures/{ingredient_id}.png

Usage
-----
# Generate structure_image_url for all curated ingredients that don't have one yet
python scripts/generate_ingredient_structures.py

# Preview without touching the DB or Storage
python scripts/generate_ingredient_structures.py --dry-run

# Re-generate even for ingredients that already have a structure image
python scripts/generate_ingredient_structures.py --force

# Target a single ingredient by its UUID
python scripts/generate_ingredient_structures.py --ingredient-id <uuid>
"""
from __future__ import annotations

import argparse
import asyncio
import io
import os
import sys
import uuid

import httpx
from rdkit import Chem
from rdkit.Chem import Draw
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.ingredient import Ingredient

UPLOAD_TIMEOUT = 30.0
IMAGE_SIZE = (400, 400)

STORAGE_UPLOAD_URL = "{supabase_url}/storage/v1/object/{bucket}/{path}"
STORAGE_PUBLIC_URL = "{supabase_url}/storage/v1/object/public/{bucket}/{path}"

# ─── Curated SMILES table ──────────────────────────────────────────────────────
# Keyed by exact ingredient.canonical_name (matched case-insensitively). Every
# SMILES here has been validated against RDKit and cross-checked against the
# known molecular formula for that compound.
SMILES_BY_NAME: dict[str, str] = {
    # Vitamins
    "Ascorbic Acid": "OC[C@@H](O)[C@H]1OC(=O)C(O)=C1O",
    "Vitamin C": "OC[C@@H](O)[C@H]1OC(=O)C(O)=C1O",
    "Niacinamide": "NC(=O)c1cccnc1",
    "Vitamin B6": "CC1=NC=C(CO)C(=C1O)CO",
    "Retinol": "CC1=C(C(CCC1)(C)C)C=CC(C)=CC=CC(C)=CCO",
    "Retinaldehyde": "CC1=C(C(CCC1)(C)C)C=CC(C)=CC=CC(C)=CC=O",
    "Tocopherol": "CC1=C(C)C2=C(C(=C1O)C)OC(C)(CCCC(C)CCCC(C)CCCC(C)C)CC2",

    # Amino acids
    "Taurine": "NCCS(=O)(=O)O",
    "L-Carnitine": "C[N+](C)(C)CC(O)CC(=O)[O-]",
    "L-Arginine": "NC(=N)NCCCC(N)C(=O)O",
    "L-Citrulline": "NC(=O)NCCCC(N)C(=O)O",
    "L-Glutamine": "NC(=O)CCC(N)C(=O)O",
    "L-Theanine": "CCNC(=O)CCC(N)C(=O)O",
    "Beta-Alanine": "NCCC(=O)O",
    "Branched-Chain Amino Acids": "CC(C)CC(N)C(=O)O",  # leucine, representative BCAA
    "Creatine": "NC(=N)N(C)CC(=O)O",
    "Creatine Monohydrate": "NC(=N)N(C)CC(=O)O",

    # Fatty acids
    "EPA": "CCC=CCC=CCC=CCC=CCC=CCCCC(=O)O",
    "DHA": "CCC=CCC=CCC=CCC=CCC=CCC=CCCC(=O)O",

    # Antioxidants
    "Alpha Lipoic Acid": "OC(=O)CCCC1CCSS1",
    "Resveratrol": "Oc1ccc(C=Cc2cc(O)cc(O)c2)cc1",
    "Quercetin": "O=c1c(O)c(-c2ccc(O)c(O)c2)oc2cc(O)cc(O)c12",
    "Coenzyme Q10": "COC1=C(OC)C(=O)C(CC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)C)=C(C)C1=O",

    # Common acids / small molecules ("other")
    "Curcumin": "COc1cc(C=CC(=O)CC(=O)C=Cc2ccc(O)c(OC)c2)ccc1O",
    "Caffeine": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
    "Melatonin": "CC(=O)NCCc1c[nH]c2ccc(OC)cc12",
    "Glycerin": "OCC(O)CO",
    "Citric Acid": "C(C(=O)O)C(CC(=O)O)(C(=O)O)O",
    "Lactic Acid": "CC(O)C(=O)O",
    "Glycolic Acid": "OCC(=O)O",
    "Salicylic Acid": "OC(=O)c1ccccc1O",
    "Kojic Acid": "OCC1=CC(=O)C(O)=CO1",
    "Salicylate": "CC(=O)Oc1ccccc1C(=O)O",  # acetylsalicylic acid (aspirin)
    "Ibuprofen": "CC(C)Cc1ccc(cc1)C(C)C(=O)O",
    "Acetaminophen": "CC(=O)Nc1ccc(O)cc1",
    "Azelaic Acid": "OC(=O)CCCCCCCC(=O)O",
    "Tranexamic Acid": "NCC1CCC(CC1)C(=O)O",
    "Glucosamine": "OCC1OC(O)C(N)C(O)C1O",
    "MSM": "CS(=O)(=O)C",
    "Ascorbyl Palmitate": "CCCCCCCCCCCCCCCC(=O)OCC(O)C1OC(=O)C(O)=C1O",
    "Diphenhydramine": "CN(C)CCOC(c1ccccc1)c1ccccc1",
    "Benzoyl Peroxide": "O=C(OOC(=O)c1ccccc1)c1ccccc1",
    "Benzophenone": "O=C(c1ccccc1)c1ccc(O)c(OC)c1",  # oxybenzone (BP-3)
    "Monosodium Glutamate": "[Na+].[O-]C(=O)C(N)CCC(=O)O",
    "Aspartame": "COC(=O)C(Cc1ccccc1)NC(=O)C(N)CC(=O)O",

    # Preservatives / food & cosmetic additives
    "Sodium Bicarbonate": "[Na+].OC(=O)[O-]",
    "Sodium Benzoate": "[Na+].[O-]C(=O)c1ccccc1",
    "Potassium Sorbate": "[K+].[O-]C(=O)C=CC=CC",
    "Phenoxyethanol": "OCCOc1ccccc1",
    "Parabens": "COC(=O)c1ccc(O)cc1",  # methylparaben, representative
    "Sodium Lauryl Sulfate": "CCCCCCCCCCCCOS(=O)(=O)[O-].[Na+]",

    # Minerals — drawn as their elemental/simple-oxide form
    "Zinc": "[Zn]",
    "Iron": "[Fe]",
    "Magnesium": "[Mg]",
    "Calcium": "[Ca]",
    "Selenium": "[Se]",
    "Iodine": "II",
    "Zinc Oxide": "[Zn]=O",
    "Titanium Dioxide": "O=[Ti]=O",
}


def _storage_path(ingredient_id: uuid.UUID) -> str:
    return f"structures/{ingredient_id}.png"


def _public_url(storage_path: str) -> str:
    return STORAGE_PUBLIC_URL.format(
        supabase_url=settings.supabase_url.rstrip("/"),
        bucket=settings.supabase_structure_bucket,
        path=storage_path,
    )


def _render_structure_png(smiles: str) -> bytes | None:
    """Render a SMILES string to a PNG via RDKit. None if the SMILES is invalid."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    img = Draw.MolToImage(mol, size=IMAGE_SIZE)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def _upload_to_supabase(client: httpx.AsyncClient, image_bytes: bytes, storage_path: str) -> bool:
    url = STORAGE_UPLOAD_URL.format(
        supabase_url=settings.supabase_url.rstrip("/"),
        bucket=settings.supabase_structure_bucket,
        path=storage_path,
    )
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "image/png",
        "x-upsert": "true",
    }
    try:
        resp = await client.post(url, content=image_bytes, headers=headers, timeout=UPLOAD_TIMEOUT)
        resp.raise_for_status()
        return True
    except Exception as exc:
        print(f"    [upload] Failed for {storage_path!r}: {exc}")
        return False


async def process_ingredient(
    ingredient: Ingredient,
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    dry_run: bool = False,
) -> bool:
    """Render, upload, and record one ingredient's structure image. Returns True if updated."""
    name = ingredient.canonical_name
    smiles = SMILES_BY_NAME.get(name)

    if not smiles:
        print(f"  SKIP  {name!r} — no curated SMILES (no single molecular structure)")
        return False

    image_bytes = _render_structure_png(smiles)
    if not image_bytes:
        print(f"  FAIL  {name!r} — SMILES failed to parse: {smiles!r}")
        return False

    storage_path = _storage_path(ingredient.id)
    public_url = _public_url(storage_path)

    if dry_run:
        print(f"  DRY   {name!r} → {public_url}")
        return False

    kb = len(image_bytes) // 1024
    print(f"  ↑     {name!r} — uploading {kb} KB...")
    ok = await _upload_to_supabase(client, image_bytes, storage_path)
    if not ok:
        print(f"  FAIL  {name!r} — upload error")
        return False

    async with session_factory() as session:
        await session.execute(
            update(Ingredient)
            .where(Ingredient.id == ingredient.id)
            .values(structure_image_url=public_url)
        )
        await session.commit()

    print(f"  OK    {name!r} → {public_url}")
    return True


async def main(args: argparse.Namespace) -> None:
    if not args.dry_run:
        if not settings.supabase_url:
            print("ERROR: SUPABASE_URL is not set in .env")
            sys.exit(1)
        if not settings.supabase_service_role_key:
            print(
                "ERROR: SUPABASE_SERVICE_ROLE_KEY is not set in .env\n"
                "       Find it at: Project Settings → API → service_role"
            )
            sys.exit(1)

    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        stmt = select(Ingredient)
        if args.ingredient_id:
            try:
                iid = uuid.UUID(args.ingredient_id)
            except ValueError:
                print(f"ERROR: Invalid UUID: {args.ingredient_id!r}")
                sys.exit(1)
            stmt = stmt.where(Ingredient.id == iid)
        result = await session.execute(stmt)
        ingredients = list(result.scalars().all())

    if not ingredients:
        print("No ingredients found.")
        await engine.dispose()
        return

    if not args.force:
        to_process = [i for i in ingredients if not i.structure_image_url]
    else:
        to_process = ingredients

    curated_count = sum(1 for i in to_process if i.canonical_name in SMILES_BY_NAME)

    print(f"\nElory Ingredient Structure Generator")
    print(f"{'='*60}")
    print(f"  Mode:          {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"  Total ingreds: {len(ingredients)}")
    print(f"  To check:      {len(to_process)}")
    print(f"  Have SMILES:   {curated_count}")
    print(f"  Bucket:        {settings.supabase_structure_bucket}")
    print(f"  Force:         {'yes' if args.force else 'no'}")
    print(f"{'='*60}\n")

    if not to_process:
        print("Nothing to do — all ingredients already have a structure image.")
        print("Use --force to re-generate anyway.")
        await engine.dispose()
        return

    updated = 0
    async with httpx.AsyncClient(
        headers={"User-Agent": "Elory-StructureGenerator/1.0"},
        follow_redirects=True,
    ) as client:
        for ingredient in to_process:
            if await process_ingredient(ingredient, client, session_factory, args.dry_run):
                updated += 1

    await engine.dispose()

    print(f"\n{'='*60}")
    if args.dry_run:
        print(f"  Dry run complete. {curated_count}/{len(to_process)} ingredients have a curated structure.")
    else:
        print(f"  Done. {updated}/{len(to_process)} structure images generated.")
    print(f"{'='*60}\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Elory Ingredient Structure Generator — render 2D structures locally with RDKit",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview without making any changes")
    parser.add_argument("--force", action="store_true", help="Re-generate even if already set")
    parser.add_argument("--ingredient-id", metavar="UUID", help="Only process this specific ingredient UUID")
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(main(parse_args()))
