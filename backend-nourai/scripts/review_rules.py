"""Review curated rule drafts: approve or reject each one, and confirm the places a document fully covers.

Usage:
    python -m scripts.review_rules --reviewer NAME [--substance NAME] [--limit N]
    python -m scripts.review_rules --status

Keys: a approve · r reject (asks for a reason) · s skip · q quit. Every decision is saved as you go,
so quitting and running again resumes where you stopped.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import textwrap
from datetime import datetime, timezone

from app.core.regulation import PLACE_NAMES, STATUS_LABELS
from app.db.session import async_session_factory
from app.services.regulation.legacy import sync_legacy_peptide_fields
from app.services.regulation.review import (
    apply_decision,
    confirm_checked,
    pending_by_substance,
    pending_checks,
    progress,
)


def _show(rule) -> None:
    status = rule.classification if rule.kind == "expert_view" else STATUS_LABELS.get(rule.status, rule.status)
    print(f"\n  {PLACE_NAMES.get(rule.place, rule.place)} · {status} · {rule.applies_to or 'expert view'}"
          f"{f' · {rule.sub_scope}' if rule.sub_scope else ''}")
    for label, value in (("Condition", rule.condition), ("Effective", rule.effective_from),
                         ("Until", rule.effective_until), ("Law", rule.legal_reference), ("Why", rule.why)):
        if value:
            print(textwrap.indent(textwrap.fill(f"{label}: {value}", 100), "    "))
    print(textwrap.indent(textwrap.fill(f"Quote: {rule.source_quote}", 100), "    "))
    print(f"    Source: {rule.source_url}")


def _ask(prompt: str, allowed: str) -> str:
    while (answer := input(prompt).strip().lower()) not in allowed:
        pass
    return answer


async def review(reviewer: str, substance_name: str | None, limit: int | None) -> None:
    approved = 0
    async with async_session_factory() as session:
        groups = await pending_by_substance(session, limit, substance_name)
    for substance, rules in groups:
        print(f"\n══ {substance.name} ({len(rules)} draft{'s' if len(rules) != 1 else ''})")
        for rule in rules:
            _show(rule)
            answer = _ask("  [a]pprove [r]eject [s]kip [q]uit: ", "arsq")
            if answer == "q":
                return await _finish(approved)
            if answer == "s":
                continue
            note = input("  Reason: ").strip() if answer == "r" else None
            async with async_session_factory() as session, session.begin():
                await apply_decision(session, rule.id, "approve" if answer == "a" else "reject", reviewer, note,
                                     datetime.now(timezone.utc))
            approved += answer == "a"
        async with async_session_factory() as session:
            checks = await pending_checks(session, substance.id)
        for check in checks:
            print(f"\n  Proposed: no specific rule in {PLACE_NAMES.get(check.place, check.place)} for {check.applies_to}")
            print(f"    Documents read: {', '.join(check.documents)}")
            if _ask("  Confirm checked? [y]es [n]o: ", "yn") == "y":
                async with async_session_factory() as session, session.begin():
                    await confirm_checked(session, substance.id, check.place, check.applies_to, check.documents,
                                          reviewer, datetime.now(timezone.utc))
    await _finish(approved)


async def _finish(approved: int) -> None:
    if approved:
        async with async_session_factory() as session, session.begin():
            synced = await sync_legacy_peptide_fields(session)
        print(f"\nApproved {approved}; peptide legacy fields refreshed for {synced} ingredient(s).")


async def status() -> None:
    async with async_session_factory() as session:
        print(json.dumps(await progress(session)))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reviewer")
    parser.add_argument("--substance")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--status", action="store_true")
    args = parser.parse_args()
    if args.status:
        asyncio.run(status())
    elif not args.reviewer:
        parser.error("--reviewer is required to review")
    else:
        asyncio.run(review(args.reviewer, args.substance, args.limit))


if __name__ == "__main__":
    main()
