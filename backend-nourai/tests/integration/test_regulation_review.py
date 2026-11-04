"""The owner's review publishes or rejects drafts one at a time, and can stop and resume."""
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.regulation import RegulatedSubstance, RegulatoryRule, RuleCheck
from app.services.regulation.review import (
    apply_decision,
    confirm_checked,
    pending_by_substance,
    pending_checks,
    progress,
)

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 11, 4, tzinfo=timezone.utc)


def _curated(substance, place="GB", status="prescription_only", review_status="draft"):
    return RegulatoryRule(
        substance_id=substance.id, place=place, authority="MHRA", kind="law", status=status,
        applies_to="supplement", source_url="https://www.legislation.gov.uk/x", source_quote="quote",
        last_checked_at=NOW, origin="curated", review_status=review_status,
    )


async def _melatonin(session, *rules_args):
    substance = RegulatedSubstance(name="Melatonin")
    session.add(substance)
    await session.flush()
    rules = [_curated(substance, *args) for args in rules_args]
    session.add_all(rules)
    await session.flush()
    return substance, rules


async def test_approve_publishes_and_supersedes():
    async with async_session_factory() as session:
        substance, (old, new) = await _melatonin(session, ("GB", "prescription_only", "published"), ("GB",))
        await apply_decision(session, new.id, "approve", "owner", None, NOW)
        await session.refresh(old)
        await session.refresh(new)
    assert (new.review_status, new.reviewed_by, new.supersedes_id) == ("published", "owner", old.id)
    assert old.review_status == "retired"


async def test_reject_requires_reason():
    async with async_session_factory() as session:
        _, (draft,) = await _melatonin(session, ("GB",))
        with pytest.raises(ValueError):
            await apply_decision(session, draft.id, "reject", "owner", None, NOW)
        await apply_decision(session, draft.id, "reject", "owner", "Quote is about a different product", NOW)
        await session.refresh(draft)
    assert (draft.review_status, draft.review_note) == ("retired", "Quote is about a different product")


async def test_confirm_checked_creates_rule_check():
    async with async_session_factory() as session:
        substance, _ = await _melatonin(session)
        session.add(RuleCheck(substance_id=substance.id, place="FR", applies_to="supplement", checked_at=NOW,
                              origin="curated", status="pending", documents=["https://www.legifrance.gouv.fr/a"]))
        await session.flush()
        assert len(await pending_checks(session, substance.id)) == 1
        await confirm_checked(session, substance.id, "FR", "supplement", ["https://www.legifrance.gouv.fr/a"], "owner", NOW)
        await confirm_checked(session, substance.id, "CA", "supplement", ["https://health-products.canada.ca/b"], "owner", NOW)
        checks = (await session.execute(select(RuleCheck).order_by(RuleCheck.place))).scalars().all()
    assert [(c.place, c.status, c.reviewed_by) for c in checks] == [("CA", "confirmed", "owner"), ("FR", "confirmed", "owner")]


async def test_progress_counts():
    async with async_session_factory() as session:
        await _melatonin(session, ("GB",), ("FR",), ("CA", "prescription_only", "published"))
        counts = await progress(session)
    assert counts == {"draft": 2, "published": 1, "retired": 0, "pending_checks": 0}


async def test_resume():
    async with async_session_factory() as session:
        substance, (first, _, _) = await _melatonin(session, ("GB",), ("FR",), ("CA",))
        await apply_decision(session, first.id, "approve", "owner", None, NOW)
        [(found, drafts)] = await pending_by_substance(session)
    assert found.id == substance.id and len(drafts) == 2



async def test_pending_checks_without_drafts_are_reviewable():
    async with async_session_factory() as session:
        substance, _ = await _melatonin(session)
        session.add(RuleCheck(substance_id=substance.id, place="WADA", applies_to="sport", checked_at=NOW,
                              origin="curated", status="pending", documents=["https://www.wada-ama.org/x"]))
        await session.flush()
        [(found, drafts)] = await pending_by_substance(session)
        counts = await progress(session)
    assert found.id == substance.id and drafts == []
    assert counts["pending_checks"] == 1


async def test_approving_a_second_rule_in_the_same_slot_keeps_the_first():
    async with async_session_factory() as session:
        _, (limit, warning) = await _melatonin(session, ("EU", "allowed_with_limits", "published"), ("EU", "warning_label"))
        await apply_decision(session, warning.id, "approve", "owner", None, NOW)
        await session.refresh(limit)
    assert limit.review_status == "published"
