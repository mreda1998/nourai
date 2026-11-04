"""API shapes for ingredient rules: place rows, expert views, product notes."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

from app.core.regulation import PLACE_NAMES, STATUS_LABELS
from app.models.regulation import RegulatedSubstance
from app.services.regulation.rules import (
    CheckFact,
    RuleFact,
    expert_views,
    live,
    place_rows,
    summary_line,
)

IARC_EXPLAINER = "This rates whether it can cause cancer, not how likely it is at normal amounts."


class RuleSourceOut(BaseModel):
    authority: str
    legal_reference: str | None = None
    url: str
    last_checked_at: datetime


class PlaceRuleOut(BaseModel):
    id: str
    status: str
    status_label: str
    applies_to: str | None = None
    sub_scope: str | None = None
    condition: str | None = None
    effective_from: date | None = None
    effective_until: date | None = None
    why: str | None = None
    source: RuleSourceOut


class PlaceRowOut(BaseModel):
    place: str
    place_name: str
    is_yours: bool
    via_place: str | None = None
    checked_no_rule: bool = False
    rules: list[PlaceRuleOut] = []


class ExpertViewOut(BaseModel):
    id: str
    body: str
    body_name: str
    classification: str | None = None
    explainer: str | None = None
    effective_from: date | None = None
    source: RuleSourceOut


class SubstanceRulesOut(BaseModel):
    substance_id: str
    name: str
    scope_label: str | None = None
    summary: str | None = None
    places: list[PlaceRowOut] = []
    expert_views: list[ExpertViewOut] = []


class RulesBlock(BaseModel):
    country: str
    substances: list[SubstanceRulesOut] = []
    last_checked_at: datetime | None = None


class SubstanceDetail(BaseModel):
    id: str
    name: str
    e_number: str | None = None
    inci: str | None = None
    ingredient_ids: list[str] = []
    rules: RulesBlock


class RuleNoteOut(BaseModel):
    text: str
    status: str
    place: str
    more: int = 0
    substance_id: str
    substance_name: str | None = None


class RulesGlanceOut(BaseModel):
    where_you_live: int
    elsewhere: int


def _source(rule: RuleFact) -> RuleSourceOut:
    return RuleSourceOut(authority=rule.authority, legal_reference=rule.legal_reference, url=rule.source_url,
                         last_checked_at=rule.last_checked_at)


def _place_rule(rule: RuleFact) -> PlaceRuleOut:
    return PlaceRuleOut(
        id=rule.id, status=rule.status, status_label=STATUS_LABELS.get(rule.status, rule.status),
        applies_to=rule.applies_to, sub_scope=rule.sub_scope, condition=rule.condition,
        effective_from=rule.effective_from, effective_until=rule.effective_until, why=rule.why,
        source=_source(rule),
    )


def build_rules_block(
    substances: list[tuple[RegulatedSubstance, str | None]],
    facts: dict[str, tuple[list[RuleFact], list[CheckFact]]],
    country: str,
    today: date,
) -> RulesBlock:
    out: list[SubstanceRulesOut] = []
    checked_dates: list[datetime] = []
    for substance, scope_label in substances:
        rules, checks = facts.get(str(substance.id), ([], []))
        rows = place_rows(rules, checks, country, today)
        views = expert_views(rules, today)
        if not rows and not views:
            continue
        checked_dates += [r.last_checked_at for r in live(rules, today)]
        out.append(SubstanceRulesOut(
            substance_id=str(substance.id), name=substance.name, scope_label=scope_label,
            summary=summary_line(rules, today),
            places=[
                PlaceRowOut(place=row.place, place_name=row.place_name, is_yours=row.is_yours,
                            via_place=row.via_place, checked_no_rule=row.checked_no_rule,
                            rules=[_place_rule(r) for r in row.rules])
                for row in rows
            ],
            expert_views=[
                ExpertViewOut(id=v.id, body=v.place, body_name=PLACE_NAMES.get(v.place, v.place),
                              classification=v.classification,
                              explainer=IARC_EXPLAINER if v.place == "IARC" else None,
                              effective_from=v.effective_from, source=_source(v))
                for v in views
            ],
        ))
    return RulesBlock(country=country, substances=out, last_checked_at=min(checked_dates) if checked_dates else None)
