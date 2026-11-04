"""The owner's review of curated rules: approve, reject with a reason, confirm checked places.

Every decision is committed on its own by the CLI, so a review can stop and pick up where it left off.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.regulation import RegulatedSubstance, RegulatoryRule, RuleCheck


async def pending_by_substance(
    session: AsyncSession, limit_substances: int | None = None, name: str | None = None
) -> list[tuple[RegulatedSubstance, list[RegulatoryRule]]]:
    """Substances with drafts or proposed checks to review, in name order, with their drafts."""
    drafts = (select(RegulatoryRule.substance_id)
              .where(RegulatoryRule.origin == "curated", RegulatoryRule.review_status == "draft"))
    checks = select(RuleCheck.substance_id).where(RuleCheck.status == "pending")
    stmt = (select(RegulatedSubstance)
            .where(RegulatedSubstance.id.in_(drafts.union(checks)))
            .order_by(RegulatedSubstance.name))
    if name:
        stmt = stmt.where(func.lower(RegulatedSubstance.name) == name.lower())
    substances = list((await session.execute(stmt)).scalars())
    if limit_substances:
        substances = substances[:limit_substances]
    groups = []
    for substance in substances:
        rules = (await session.execute(
            select(RegulatoryRule).where(RegulatoryRule.substance_id == substance.id, RegulatoryRule.origin == "curated",
                                         RegulatoryRule.review_status == "draft")
            .order_by(RegulatoryRule.place, RegulatoryRule.created_at)
        )).scalars().all()
        groups.append((substance, list(rules)))
    return groups


async def pending_checks(session: AsyncSession, substance_id: uuid.UUID) -> list[RuleCheck]:
    return list((await session.execute(
        select(RuleCheck).where(RuleCheck.substance_id == substance_id, RuleCheck.status == "pending")
        .order_by(RuleCheck.place, RuleCheck.applies_to)
    )).scalars())


async def apply_decision(
    session: AsyncSession, rule_id: uuid.UUID, decision: Literal["approve", "reject"], reviewer: str,
    note: str | None, now: datetime,
) -> None:
    rule = await session.get(RegulatoryRule, rule_id)
    if rule is None or rule.review_status != "draft":
        raise ValueError("only drafts can be reviewed")
    if decision == "reject":
        if not (note or "").strip():
            raise ValueError("a rejection needs a reason")
        rule.review_status, rule.review_note = "retired", note.strip()
    elif decision == "approve":
        older = (await session.execute(select(RegulatoryRule).where(
            RegulatoryRule.substance_id == rule.substance_id, RegulatoryRule.place == rule.place,
            RegulatoryRule.applies_to == rule.applies_to, RegulatoryRule.status == rule.status,
            RegulatoryRule.origin == "curated",
            RegulatoryRule.review_status == "published", RegulatoryRule.id != rule.id,
            RegulatoryRule.sub_scope.is_(None) if rule.sub_scope is None else RegulatoryRule.sub_scope == rule.sub_scope,
        ))).scalars().all()
        for previous in older:
            previous.review_status = "retired"
            rule.supersedes_id = previous.id
        rule.review_status = "published"
    else:
        raise ValueError(f"unknown decision {decision!r}")
    rule.reviewed_by, rule.reviewed_at = reviewer, now
    await session.flush()


async def confirm_checked(
    session: AsyncSession, substance_id: uuid.UUID, place: str, applies_to: str, documents: list[str],
    reviewer: str, now: datetime,
) -> None:
    check = (await session.execute(select(RuleCheck).where(
        RuleCheck.substance_id == substance_id, RuleCheck.place == place, RuleCheck.applies_to == applies_to,
    ))).scalar_one_or_none()
    if check is None:
        check = RuleCheck(substance_id=substance_id, place=place, applies_to=applies_to, origin="curated",
                          checked_at=now, documents=[])
        session.add(check)
    check.status, check.reviewed_by, check.checked_at = "confirmed", reviewer, now
    check.documents = list(dict.fromkeys([*(check.documents or []), *documents]))
    await session.flush()


async def progress(session: AsyncSession) -> dict[str, int]:
    counts = dict((await session.execute(
        select(RegulatoryRule.review_status, func.count()).where(RegulatoryRule.origin == "curated")
        .group_by(RegulatoryRule.review_status)
    )).all())
    out = {status: counts.get(status, 0) for status in ("draft", "published", "retired")}
    out["pending_checks"] = (await session.execute(
        select(func.count()).select_from(RuleCheck).where(RuleCheck.status == "pending")
    )).scalar_one()
    return out
