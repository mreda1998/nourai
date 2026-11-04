"""
Rank merged search candidates — curated products and catalog index entries —
with one transparent score: how the query matches the name and brand, how
popular the product is, whether it's sold in the user's country, and whether
we already hold its full details.
"""
from __future__ import annotations

import math
import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from app.services.catalog.records import normalize_search_text

_TOKENS = re.compile(r"[a-z0-9]+")


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

    tokens = _TOKENS.findall(q)

    def score(candidate: Candidate) -> float:
        name = normalize_search_text(candidate.name)
        brand = normalize_search_text(candidate.brand)
        text = f"{name} {brand}"
        name_tokens = _TOKENS.findall(name)
        # "Shampoo karité" starts with the word "shampoo"; "Shampooing" only with its letters.
        # Both count while a word is still being typed, the whole word more.
        whole_prefix = bool(tokens) and name_tokens[: len(tokens)] == tokens
        return (
            4.0 * whole_prefix
            + 2.0 * (not whole_prefix and name.startswith(q))
            + 2.5 * (bool(brand) and brand.startswith(q))
            + 1.5 * all(word in text for word in words)
            + 1.0 * (bool(tokens) and set(tokens) <= set(_TOKENS.findall(text)))
            + 0.6 * math.log10(1 + max(candidate.popularity, 0))
            # Every candidate already contains the query's words, so being sold in the
            # user's country outweighs how its name starts. Popularity is mostly French
            # scans and most US products have one or two, so a weaker bonus left US
            # devices with foreign results; a foreign product named exactly like the
            # query now needs ~300x the scans to lead.
            + 5.5 * (bool(region) and region in candidate.countries)
            + 0.3 * candidate.hydrated
        )

    scored = [(score(c), c) for c in unique.values()]
    scored.sort(key=lambda pair: (-pair[0], -pair[1].popularity, pair[1].name))
    return [c for _, c in scored]
