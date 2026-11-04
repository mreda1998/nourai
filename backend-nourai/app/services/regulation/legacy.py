"""Keep the peptide status columns older app builds read in step with sourced, published rules.

`us_regulatory_status` and `wada_status` used to come from seed data with no source (it marked BPC-157
"not prohibited" by WADA, which names it under S0). Now they are derived from rules only, and are
left empty rather than guessed.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingredient import Ingredient
from app.models.regulation import IngredientSubstance, RegulatoryRule, RuleCheck


def _wada(rules: list[RegulatoryRule], checked: bool) -> str | None:
    banned = [r for r in rules if r.place == "WADA" and r.status == "banned"]
    if banned:
        at_all_times = any("in-competition" not in (r.sub_scope or "").lower() for r in banned)
        return "prohibited_all" if at_all_times else "prohibited_in_competition"
    return "not_prohibited" if checked else None


def _us(rules: list[RegulatoryRule]) -> str | None:
    us = [r for r in rules if r.place == "US" and r.applies_to in ("medicine", "supplement")]
    for rule in us:
        if rule.classification in ("compounded", "research_chemical"):
            return rule.classification
    if any(r.status in ("banned", "not_authorised") for r in us):
        return "unapproved_drug"
    if any(r.status in ("allowed", "allowed_with_limits", "prescription_only") and r.applies_to == "medicine" for r in us):
        return "fda_approved"
    return None


async def sync_legacy_peptide_fields(session: AsyncSession) -> int:
    """Rewrite both columns for every peptide; returns how many changed."""
    peptides = (await session.execute(select(Ingredient).where(Ingredient.category == "peptide"))).scalars().all()
    changed = 0
    for ingredient in peptides:
        substance_ids = (await session.execute(
            select(IngredientSubstance.substance_id).where(IngredientSubstance.ingredient_id == ingredient.id)
        )).scalars().all()
        rules = (await session.execute(select(RegulatoryRule).where(
            RegulatoryRule.substance_id.in_(substance_ids), RegulatoryRule.review_status == "published",
        ))).scalars().all() if substance_ids else []
        checked = bool(substance_ids) and (await session.execute(select(RuleCheck.id).where(
            RuleCheck.substance_id.in_(substance_ids), RuleCheck.place == "WADA", RuleCheck.status == "confirmed",
        ).limit(1))).first() is not None
        wada, us = _wada(rules, checked), _us(rules)
        if (ingredient.wada_status, ingredient.us_regulatory_status) != (wada, us):
            ingredient.wada_status, ingredient.us_regulatory_status = wada, us
            changed += 1
    await session.flush()
    return changed
