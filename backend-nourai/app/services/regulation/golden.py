"""Compare what the rules data produces with the owner-approved golden set."""
from __future__ import annotations

from datetime import date

from app.core.regulation import CATEGORY_SCOPES
from app.services.regulation.rules import RuleFact, live, note_for


def check_entry(rules: list[RuleFact], entry: dict, today: date) -> list[str]:
    """Every expectation the published rules don't meet, as a readable line."""
    problems = []
    laws = [r for r in live(rules, today) if r.kind == "law"]
    for item in entry["expect"]:
        wanted_from = date.fromisoformat(item["effective_from"]) if item.get("effective_from") else None
        if not any(r.place == item["place"] and r.applies_to == item["applies_to"] and r.status == item["status"]
                   and (wanted_from is None or r.effective_from == wanted_from) for r in laws):
            when = f" from {wanted_from}" if wanted_from else ""
            problems.append(f"missing: {item['place']} {item['applies_to']} {item['status']}{when}")
    note = entry.get("product_note")
    if note:
        found = note_for(rules, CATEGORY_SCOPES[note["category"]], note["country"], today)
        text = found.text if found else None
        if text != note["text"]:
            problems.append(f"product note ({note['category']}, {note['country']}): expected {note['text']!r}, got {text!r}")
    return problems
