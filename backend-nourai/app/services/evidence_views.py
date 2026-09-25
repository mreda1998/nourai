"""
Pure view logic for the pathway features: how far our knowledge of an
ingredient goes (the ladder), where a dose sits against studied doses, and
the compounds × domains evidence grid. No totals, no scores.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

from app.services.biodomain_scorer import _normalize_to_mg

LadderLevel = Literal["reviewed", "mechanism", "function", "unidentified"]
CellState = Literal["supports", "mixed", "risk", "mechanism", "not_reviewed"]


def ladder_level(
    *, has_published_route: bool, has_mechanism: bool, role: str | None, function_summary: str | None
) -> LadderLevel:
    if has_published_route:
        return "reviewed"
    if has_mechanism:
        return "mechanism"
    if (role and role != "unknown") or function_summary:
        return "function"
    return "unidentified"


# ── Dose bar ─────────────────────────────────────────────────────────────────

@dataclass
class DoseBar:
    studied_low: float
    studied_high: float
    unit_label: str
    upper_limit_value: float | None = None
    amount_value: float | None = None
    amount_note: str | None = None


def _to_unit(value: float, unit: str | None, target: str) -> float | None:
    """Convert value in `unit` to `target`; None when not comparable."""
    if not unit:
        return None
    if unit.strip().lower() == target.strip().lower():
        return value
    in_mg, per_target_mg = _normalize_to_mg(value, unit), _normalize_to_mg(1.0, target)
    if in_mg is None or not per_target_mg:
        return None
    return in_mg / per_target_mg


def _first_amount(text: str | None) -> tuple[float, str] | None:
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|µg|ug|iu)\b", text or "", re.IGNORECASE)
    return (float(m.group(1).replace(",", ".")), m.group(2)) if m else None


def dose_bar(
    *,
    studied_low: float,
    studied_high: float,
    studied_unit: str,
    upper_limit: str | None,
    amount: str | None,
    amount_unit: str | None,
) -> DoseBar:
    bar = DoseBar(studied_low=studied_low, studied_high=studied_high, unit_label=studied_unit)

    limit = _first_amount(upper_limit)
    if limit:
        bar.upper_limit_value = _to_unit(limit[0], limit[1], studied_unit)

    if amount is None:
        bar.amount_note = "Amount on this product unknown"
        return bar
    embedded = _first_amount(str(amount)) if not amount_unit else None
    if embedded:  # "5g", "0.2 g" — the label put the unit inside the amount
        value, amount_unit = embedded
    else:
        try:
            value = float(str(amount).strip().split()[0].replace(",", "."))
        except (ValueError, IndexError):
            bar.amount_note = "Amount on this product unknown"
            return bar
    converted = _to_unit(value, amount_unit, studied_unit)
    if converted is None:
        bar.amount_note = "Units not comparable"
    else:
        bar.amount_value = round(converted, 6)
    return bar


# ── Evidence grid ────────────────────────────────────────────────────────────

GridInput = tuple[str, LadderLevel, list[tuple[str, str, str]]]  # (compound, level, [(domain, direction, strength)])

_DIRECTION_STATE: dict[str, CellState] = {"supports": "supports", "benefit": "supports", "mixed": "mixed", "risk": "risk", "harm": "risk"}


@dataclass
class GridRow:
    compound: str
    level: LadderLevel
    cells: dict[str, dict] = field(default_factory=dict)


@dataclass
class Grid:
    columns: list[str]
    rows: list[GridRow]


def evidence_grid(rows: list[GridInput]) -> Grid:
    columns = sorted({domain for _, _, published in rows for domain, _, _ in published})
    out: list[GridRow] = []
    for compound, level, published in sorted(rows, key=lambda r: r[0].lower()):
        by_domain = {domain: (direction, strength) for domain, direction, strength in published}
        row = GridRow(compound=compound, level=level)
        for col in columns:
            if col in by_domain:
                direction, strength = by_domain[col]
                row.cells[col] = {"state": _DIRECTION_STATE.get(direction, "mixed"), "strength": strength}
            elif level == "mechanism":
                row.cells[col] = {"state": "mechanism", "strength": None}
            else:
                row.cells[col] = {"state": "not_reviewed", "strength": None}
        out.append(row)
    return Grid(columns=columns, rows=out)
