"""
What Ask Elory knows about the person's stack, from Elory's own research.

The chat model otherwise sees only product names and has to answer from
general knowledge. This turns the researched claims behind each ingredient in
the stack, and the ingredients that appear in more than one product, into a
short brief for the system prompt, worded the way the app words them. Pure.
"""
from __future__ import annotations

from typing import Any

from app.services.stack_review import stack_review

MAX_INGREDIENTS = 20
MAX_CLAIMS = 4

_CERTAINTY = {"high": "high", "moderate": "moderate", "low": "low", "very_low": "very low"}


def claim_answer(kind: str, verdict: str | None, certainty: str | None) -> str:
    """The app's plain answer to a claim (nourai/utils/evidence.ts), so chat and screens agree."""
    certainty = certainty or "very_low"
    if verdict in ("strong", "moderate", "limited"):
        if certainty == "very_low":
            return "too early to tell"
        if kind == "safety":
            return {"high": "known risk", "moderate": "likely risk"}.get(certainty, "possible risk")
        return {"high": "works", "moderate": "probably works"}.get(certainty, "may work")
    if verdict == "unlikely":
        sure = certainty in ("high", "moderate")
        if kind == "safety":
            return "no sign of this risk" if sure else "no clear sign of this risk"
        return "probably doesn't work" if sure else "may not work"
    if verdict == "mixed":
        return "mixed reports" if kind == "safety" else "mixed results"
    return "not enough research"


def research_brief(product_ingredients: list[Any]) -> str:
    """Claim-by-claim research for the stack's ingredients; empty when we hold none."""
    seen: dict[str, Any] = {}
    for row in product_ingredients:
        ingredient = getattr(row, "ingredient", None)
        if ingredient is not None and str(ingredient.id) not in seen:
            seen[str(ingredient.id)] = ingredient

    lines: list[str] = []
    for ingredient in sorted(seen.values(), key=lambda i: i.canonical_name)[:MAX_INGREDIENTS]:
        claims = [c for c in (getattr(ingredient, "claims", None) or []) if c.verdict and c.verdict != "insufficient"]
        if not claims:
            continue
        claims.sort(key=lambda c: (c.kind != "safety", getattr(c, "position", 0) or 0))
        parts = []
        for claim in claims[:MAX_CLAIMS]:
            certainty = _CERTAINTY.get(claim.certainty or "very_low", "very low")
            text = f'"{claim.claim}": {claim_answer(claim.kind, claim.verdict, claim.certainty)} ({certainty} certainty)'
            if getattr(claim, "dose_note", None):
                text += f"; dose: {claim.dose_note}"
            parts.append(text)
        lines.append(f"  • {ingredient.canonical_name}: " + " | ".join(parts))

    overlaps = stack_review(product_ingredients).overlaps
    overlap_lines = [f"  • {o.ingredient} is in {', '.join(o.products)}" for o in overlaps]

    if not lines and not overlap_lines:
        return ""
    blocks = []
    if lines:
        blocks.append("Elory's research on ingredients in this stack (claim: verdict):\n" + "\n".join(lines))
    if overlap_lines:
        blocks.append("Ingredients that appear in more than one product:\n" + "\n".join(overlap_lines))
    return "\n\n".join(blocks)
