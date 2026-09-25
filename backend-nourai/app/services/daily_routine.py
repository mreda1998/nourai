"""
Turn a user's logged day into ingredient rows the biodomain scorer can read.

The scorer works per ingredient row and caps each row's dose ratio at the
effective dose. Feeding it one row per product per ingredient would let two
products with the same ingredient each count fully, and would ignore how
many servings were actually logged. So the day is combined first: one row
per canonical ingredient carrying the total amount taken.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.services.biodomain_scorer import _normalize_to_mg


def local_day_bounds(tz_name: str | None, now: datetime | None = None) -> tuple[datetime, datetime]:
    """UTC start and end of the user's current local day. Unknown zones use UTC."""
    try:
        tz = ZoneInfo(tz_name) if tz_name else timezone.utc
    except (ZoneInfoNotFoundError, ValueError):
        tz = timezone.utc
    local_now = (now or datetime.now(timezone.utc)).astimezone(tz)
    start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = (start + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


@dataclass
class DailyIngredient:
    """Duck-types the ProductIngredient fields the scorer reads."""
    name: str
    ingredient: Any
    amount: str | None
    unit: str | None


def _parse_amount(amount: str | None) -> float | None:
    if amount is None:
        return None
    try:
        return float(str(amount).strip().split()[0])
    except (ValueError, IndexError):
        return None


def combine_daily_ingredients(
    servings_by_product: dict[uuid.UUID, float],
    product_ingredients: Iterable[Any],
) -> list[DailyIngredient]:
    """
    One row per canonical ingredient with the day's total amount.

    Totals are summed in mg when every contributing row converts to mass,
    otherwise in a shared unit (e.g. IU). If any contributing row has no
    usable amount, the total is unknown (amount None) rather than partial.
    """
    groups: dict[uuid.UUID, list[Any]] = defaultdict(list)
    for pi in product_ingredients:
        if pi.ingredient_id is None or pi.ingredient is None:
            continue
        groups[pi.ingredient_id].append(pi)

    rows: list[DailyIngredient] = []
    for items in groups.values():
        ingredient = items[0].ingredient
        name = getattr(ingredient, "canonical_name", items[0].name)
        amount, unit = _total(items, servings_by_product)
        rows.append(DailyIngredient(name=name, ingredient=ingredient, amount=amount, unit=unit))
    return rows


def _total(items: list[Any], servings_by_product: dict[uuid.UUID, float]) -> tuple[str | None, str | None]:
    parsed = []
    for pi in items:
        value = _parse_amount(pi.amount)
        if value is None:
            return None, None
        parsed.append((value * servings_by_product.get(pi.product_id, 1.0), pi.unit))

    in_mg = [_normalize_to_mg(value, unit) for value, unit in parsed]
    if all(v is not None for v in in_mg):
        return _fmt(sum(in_mg)), "mg"

    units = {(unit or "").lower().strip() for _, unit in parsed}
    if len(units) == 1 and units != {""}:
        return _fmt(sum(value for value, _ in parsed)), parsed[0][1]
    return None, None


def _fmt(value: float) -> str:
    return f"{value:g}"
