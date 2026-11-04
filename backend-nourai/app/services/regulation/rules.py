"""Turn published rules into what a person sees: place rows, a summary line, product notes.

Pure functions over plain facts so the wording can be pinned by tests. Laws and expert views never
mix: summaries and notes are built from laws only.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from app.core.regulation import (
    EU_MEMBERS,
    EXPERT_BODIES,
    FLAG_STATUSES,
    LAW_STATUSES,
    PLACE_NAMES,
    PLACE_PHRASES,
    PLACES,
    SCOPE_PHRASES,
    SCOPES,
    STATUS_LABELS,
    own_places,
)


@dataclass(frozen=True)
class RuleFact:
    id: str
    substance_id: str
    place: str
    authority: str
    kind: str
    status: str
    classification: str | None
    applies_to: str | None
    sub_scope: str | None
    condition: str | None
    effective_from: date | None
    effective_until: date | None
    legal_reference: str | None
    source_url: str
    last_checked_at: datetime
    why: str | None


@dataclass(frozen=True)
class CheckFact:
    place: str
    applies_to: str
    checked_at: datetime


@dataclass
class PlaceRowView:
    place: str
    place_name: str
    is_yours: bool
    via_place: str | None
    rules: list[RuleFact] = field(default_factory=list)
    checked_no_rule: bool = False


@dataclass(frozen=True)
class NoteView:
    text: str
    status: str
    place: str
    more: int
    substance_id: str


def format_day(d: date) -> str:
    return f"{d.day} {d:%b %Y}"


def live(rules: list[RuleFact], today: date) -> list[RuleFact]:
    return [r for r in rules if r.effective_until is None or r.effective_until >= today]


def _laws(rules: list[RuleFact], today: date) -> list[RuleFact]:
    return [r for r in live(rules, today) if r.kind == "law"]


def _place_order(place: str) -> int:
    return PLACES.index(place) if place in PLACES else len(PLACES)


def _severity(status: str) -> int:
    return LAW_STATUSES.index(status) if status in LAW_STATUSES else len(LAW_STATUSES)


def _join(phrases: list[str]) -> str:
    return phrases[0] if len(phrases) == 1 else f"{', '.join(phrases[:-1])} and {phrases[-1]}"


def place_rows(rules: list[RuleFact], checks: list[CheckFact], country: str, today: date) -> list[PlaceRowView]:
    """One row per place with a law or a check; the person's own country first."""
    by_place: dict[str, list[RuleFact]] = {}
    for rule in _laws(rules, today):
        by_place.setdefault(rule.place, []).append(rule)
    checked = {c.place for c in checks}

    rows: list[PlaceRowView] = []
    skip: set[str] = set()
    if country in by_place:
        rows.append(PlaceRowView(country, PLACE_NAMES.get(country, country), True, None, by_place[country], False))
        skip.add(country)
    elif country in EU_MEMBERS and "EU" in by_place:
        # No national rule: the person's row carries the EU's, labelled as an EU rule. A national
        # "checked, nothing specific" never hides an EU rule that applies there.
        rows.append(PlaceRowView(country, PLACE_NAMES.get(country, country), True, "EU", by_place["EU"], False))
        skip |= {"EU", country}
    elif country in checked:
        rows.append(PlaceRowView(country, PLACE_NAMES.get(country, country), True, None, [], True))
        skip.add(country)
    elif country in EU_MEMBERS and "EU" in checked:
        rows.append(PlaceRowView(country, PLACE_NAMES.get(country, country), True, "EU", [], True))
        skip.add("EU")

    for place in sorted(set(by_place) | checked, key=_place_order):
        if place in skip:
            continue
        rows.append(PlaceRowView(place, PLACE_NAMES.get(place, place), False, None,
                                 by_place.get(place, []), place not in by_place))
    return rows


def expert_views(rules: list[RuleFact], today: date) -> list[RuleFact]:
    views = [r for r in live(rules, today) if r.kind == "expert_view"]
    return sorted(views, key=lambda r: EXPERT_BODIES.index(r.place) if r.place in EXPERT_BODIES else 99)


def summary_line(rules: list[RuleFact], today: date) -> str | None:
    """Laws only, for the scope of the most severe rule, most severe status first."""
    laws = [r for r in _laws(rules, today) if r.applies_to]
    if not laws:
        return None
    lead = min(laws, key=lambda r: (_severity(r.status), SCOPES.index(r.applies_to) if r.applies_to in SCOPES else 99))
    scope = lead.applies_to

    groups: dict[tuple[str, date | None], set[str]] = {}
    for rule in laws:
        if rule.applies_to != scope:
            continue
        future = rule.effective_from if rule.effective_from and rule.effective_from > today else None
        groups.setdefault((rule.status, future), set()).add(rule.place)

    sentences = []
    for i, ((status, future), places) in enumerate(sorted(groups.items(), key=lambda g: (_severity(g[0][0]), g[0][1] or date.min))):
        words = [STATUS_LABELS.get(status, status)]
        if i == 0:
            words.append(SCOPE_PHRASES.get(scope, ""))
        words.append("in " + _join([PLACE_PHRASES.get(p, p) for p in sorted(places, key=_place_order)]))
        if future:
            words.append(f"from {format_day(future)}")
        sentences.append(" ".join(w for w in words if w) + ".")
    return " ".join(sentences)


def note_for(rules: list[RuleFact], scopes: tuple[str, ...], country: str, today: date) -> NoteView | None:
    """The one note a product row shows, or None when nothing flags in these scopes."""
    candidates = [r for r in _laws(rules, today) if r.applies_to in scopes and r.status in FLAG_STATUSES]
    if not candidates:
        return None
    mine = own_places(country)
    best = min(candidates, key=lambda r: (
        r.place not in mine, FLAG_STATUSES.index(r.status), r.place != "EU", _place_order(r.place)
    ))
    words = [STATUS_LABELS[best.status]]
    if best.status == "not_authorised":
        words.append(SCOPE_PHRASES[best.applies_to])
    words.append("in " + PLACE_PHRASES.get(best.place, best.place))
    if best.effective_from and best.effective_from > today:
        words.append(f"from {format_day(best.effective_from)}")
    text = " ".join(words)
    if best.sub_scope:
        # Never "banned" without its scope: an aerosol-only or in-competition rule says so.
        text += f" · {best.sub_scope if len(best.sub_scope) <= 60 else 'conditions apply'}"
    others = {r.place for r in candidates} - {best.place}
    return NoteView(text=text, status=best.status, place=best.place, more=len(others),
                    substance_id=best.substance_id)


def glance(notes: list[NoteView], country: str) -> tuple[int, int]:
    """(rows restricted where the person lives, rows restricted only elsewhere)."""
    mine = own_places(country)
    where = sum(1 for n in notes if n and n.place in mine)
    return where, sum(1 for n in notes if n) - where
