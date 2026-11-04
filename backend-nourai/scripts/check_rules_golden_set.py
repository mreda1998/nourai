"""Check the rules data against the owner-approved golden set (data/regulation/golden_set.json).

Usage:
    python -m scripts.check_rules_golden_set [--include-unapproved]

Entries without `approved_by` are skipped and listed as awaiting approval, unless
--include-unapproved is given (useful while drafting). Exits 1 on any mismatch.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.regulation import RegulatedSubstance, SubstanceAlias
from app.services.regulation.golden import check_entry
from app.services.regulation.identifiers import alias_key, normalize_e_number
from app.services.regulation.store import load_rule_facts

GOLDEN = Path(__file__).parents[1] / "data" / "regulation" / "golden_set.json"


async def _substance_ids(session, entry: dict) -> list:
    if entry.get("e_number"):
        found = (await session.execute(select(RegulatedSubstance.id).where(
            RegulatedSubstance.e_number == normalize_e_number(entry["e_number"])))).scalars().all()
        if found:
            return list(found)
    return list((await session.execute(select(SubstanceAlias.substance_id).where(
        SubstanceAlias.normalized_alias == alias_key(entry["substance"], "name")).distinct())).scalars())


async def run(include_unapproved: bool) -> int:
    failures = 0
    async with async_session_factory() as session:
        for entry in json.loads(GOLDEN.read_text()):
            if not entry.get("approved_by") and not include_unapproved:
                print(f"…  {entry['substance']}: awaiting approval")
                continue
            ids = await _substance_ids(session, entry)
            facts = await load_rule_facts(session, ids)
            rules = [rule for rules, _ in facts.values() for rule in rules]
            problems = check_entry(rules, entry, date.today()) if ids else ["substance not found"]
            failures += bool(problems)
            print(f"{'✗' if problems else '✓'}  {entry['substance']}" + "".join(f"\n     {p}" for p in problems))
    return 1 if failures else 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--include-unapproved", action="store_true")
    sys.exit(asyncio.run(run(parser.parse_args().include_unapproved)))


if __name__ == "__main__":
    main()
