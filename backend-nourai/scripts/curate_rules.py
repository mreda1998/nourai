"""Draft curated rules from official documents listed in manifests, for owner review.

Usage:
    python -m scripts.curate_rules data/regulation/curation/<slug>.json [...] [--dry-run]

A manifest names one substance, the places to report on and the official documents to read:
    {"substance": {"name": "Melatonin", "e_number": null, "cas": "73-31-4",
                   "aliases": [["melatonine", "name", "fr"]], "ingredient": "Melatonin",
                   "scope_label": null},
     "places": ["GB", "FR", "CA", "US"],
     "documents": [{"url": "https://…", "place": "GB"},
                   {"url": "https://www.wada-ama.org/…", "file": "documents/wada-2026.pdf"}]}
A document with "file" is read from a copy saved next to the manifest (for sites that refuse
automated clients); its official "url" is still the citation.
Drafts are stored unserved; review them with `make review-rules`.
"""
from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

import anthropic
import httpx
from sqlalchemy import select

from app.core.config import settings
from app.db.session import async_session_factory
from app.models.ingredient import Ingredient
from app.models.regulation import IngredientSubstance
from app.services.regulation.curation import draft_rules, store_drafts
from app.services.regulation.documents import fetch_document, read_saved_document
from app.services.regulation.importer import ParsedSubstance, upsert_substance
from app.services.research.llm import ResearchLLM


async def curate(path: Path, llm: ResearchLLM, client: httpx.AsyncClient, dry_run: bool) -> dict:
    manifest = json.loads(path.read_text())
    spec = manifest["substance"]
    documents = [
        read_saved_document(d["url"], path.parent / d["file"]) if d.get("file") else await fetch_document(d["url"], client)
        for d in manifest["documents"]
    ]
    result = await draft_rules(llm, spec["name"], manifest["places"], documents)
    summary = {"manifest": path.name, "kept": len(result.kept), "dropped": len(result.dropped),
               "proposed_checks": len(result.checked)}
    if dry_run:
        summary["drafts"] = [d.model_dump(mode="json") for d in result.kept]
        return summary
    async with async_session_factory() as session, session.begin():
        substance, _ = await upsert_substance(session, ParsedSubstance(
            key=spec["name"], name=spec["name"], e_number=spec.get("e_number"), cas=spec.get("cas"),
            aliases=[tuple(a) for a in spec.get("aliases", [])],
        ), None)
        if spec.get("ingredient"):
            ingredient = (await session.execute(
                select(Ingredient).where(Ingredient.canonical_name == spec["ingredient"])
            )).scalar_one_or_none()
            if ingredient and not await session.get(IngredientSubstance, (ingredient.id, substance.id)):
                session.add(IngredientSubstance(ingredient_id=ingredient.id, substance_id=substance.id,
                                                scope_label=spec.get("scope_label")))
            summary["linked_ingredient"] = bool(ingredient)
        await store_drafts(session, substance.id, result, documents, datetime.now(timezone.utc))
    return summary


async def run(paths: list[Path], dry_run: bool) -> None:
    llm = ResearchLLM(anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key))
    async with httpx.AsyncClient(timeout=120) as client:
        for path in paths:
            print(json.dumps(await curate(path, llm, client, dry_run), indent=2, ensure_ascii=False))
    print(json.dumps({"usage": {k: dict(v) for k, v in llm.usage.items()}}))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifests", nargs="+", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(args.manifests, args.dry_run))


if __name__ == "__main__":
    main()
