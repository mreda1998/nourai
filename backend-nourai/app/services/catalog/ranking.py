"""
Rank merged search candidates — curated products and catalog index entries —
with one transparent score: how the query matches the name and brand, how
popular the product is, whether it's sold in the user's country, and whether
we already hold its full details.
"""
from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from app.services.catalog.records import normalize_search_text


@dataclass(frozen=True, slots=True)
class Candidate:
    key: str                     # "p:<uuid>" for products, "c:<id>" for catalog entries
    name: str
    brand: str | None
    popularity: int
    countries: tuple[str, ...]
    hydrated: bool
    payload: Any


def rank(query: str, candidates: Iterable[Candidate], *, country: str | None) -> list[Candidate]:
    q = normalize_search_text(query)
    words = q.split()
    region = (country or "").upper()
    unique: dict[str, Candidate] = {}
    for candidate in candidates:
        unique.setdefault(candidate.key, candidate)

    def score(candidate: Candidate) -> float:
        name = normalize_search_text(candidate.name)
        brand = normalize_search_text(candidate.brand)
        text = f"{name} {brand}"
        return (
            4.0 * name.startswith(q)
            + 2.5 * (bool(brand) and brand.startswith(q))
            + 1.5 * all(word in text for word in words)
            + 0.6 * math.log10(1 + max(candidate.popularity, 0))
            + 1.5 * (bool(region) and region in candidate.countries)
            + 0.3 * candidate.hydrated
        )

    scored = [(score(c), c) for c in unique.values()]
    scored.sort(key=lambda pair: (-pair[0], -pair[1].popularity, pair[1].name))
    return [c for _, c in scored]
