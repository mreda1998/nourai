"""Load what may be served — published rules with a source, confirmed checks — as plain facts."""
from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.regulation import IngredientSubstance, RegulatedSubstance, RegulatoryRule, RuleCheck
from app.services.regulation.rules import CheckFact, RuleFact


def rule_fact(rule: RegulatoryRule) -> RuleFact:
    return RuleFact(
        id=str(rule.id), substance_id=str(rule.substance_id), place=rule.place, authority=rule.authority,
        kind=rule.kind, status=rule.status, classification=rule.classification, applies_to=rule.applies_to,
        sub_scope=rule.sub_scope, condition=rule.condition, effective_from=rule.effective_from,
        effective_until=rule.effective_until, legal_reference=rule.legal_reference,
        source_url=rule.source_url, last_checked_at=rule.last_checked_at, why=rule.why,
    )


async def load_rule_facts(
    session: AsyncSession, substance_ids: list[uuid.UUID]
) -> dict[str, tuple[list[RuleFact], list[CheckFact]]]:
    """Per substance id: its servable rules and confirmed checks. Drafts and retired rules never load."""
    facts: dict[str, tuple[list[RuleFact], list[CheckFact]]] = defaultdict(lambda: ([], []))
    if not substance_ids:
        return {}
    rules = await session.execute(
        select(RegulatoryRule).where(
            RegulatoryRule.substance_id.in_(substance_ids),
            RegulatoryRule.review_status == "published",
            RegulatoryRule.source_url.is_not(None),
            RegulatoryRule.source_url != "",
            RegulatoryRule.last_checked_at.is_not(None),
        )
    )
    for rule in rules.scalars():
        facts[str(rule.substance_id)][0].append(rule_fact(rule))
    checks = await session.execute(
        select(RuleCheck).where(RuleCheck.substance_id.in_(substance_ids), RuleCheck.status == "confirmed")
    )
    for check in checks.scalars():
        facts[str(check.substance_id)][1].append(CheckFact(check.place, check.applies_to, check.checked_at))
    return dict(facts)


async def substances_for_ingredient(
    session: AsyncSession, ingredient_id: uuid.UUID
) -> list[tuple[RegulatedSubstance, str | None]]:
    rows = await session.execute(
        select(RegulatedSubstance, IngredientSubstance.scope_label)
        .join(IngredientSubstance, IngredientSubstance.substance_id == RegulatedSubstance.id)
        .where(IngredientSubstance.ingredient_id == ingredient_id)
        .order_by(RegulatedSubstance.name)
    )
    return [(substance, label) for substance, label in rows.all()]


async def ingredient_ids_for_substance(session: AsyncSession, substance_id: uuid.UUID) -> list[str]:
    rows = await session.execute(
        select(IngredientSubstance.ingredient_id).where(IngredientSubstance.substance_id == substance_id)
    )
    return [str(i) for i in rows.scalars()]
