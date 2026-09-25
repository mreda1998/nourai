"""
Label ingredient name → canonical library Ingredient, and the status badge
that follows from it. Shared by live ingestion and the import/backfill
scripts so every path links and labels ingredients the same way.
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING, Iterable

from app.models.product import IngredientStatus

if TYPE_CHECKING:
    from app.models.ingredient import Ingredient

# Label words that mark a compound used as an excipient or texturiser rather
# than a source of the named nutrient: "magnesium stearate" is a flow agent,
# not magnesium. Such labels only match exactly.
_EXCIPIENT_WORDS = frozenset({"stearate", "silicate", "aluminum", "aluminium"})

# Library names shorter than this are only matched exactly — "iron" or "zinc"
# inside a longer label name is too often a different compound.
MIN_PARTIAL_KEY_LEN = 5


def build_lookup(ingredients: Iterable["Ingredient"]) -> dict[str, "Ingredient"]:
    """
    Flat name → Ingredient lookup. Synonyms go in first so that a canonical
    name always wins when two library entries claim the same string.
    """
    ingredients = list(ingredients)
    lookup: dict[str, Ingredient] = {}
    for ing in ingredients:
        for syn in ing.synonyms or []:
            lookup.setdefault(_normalize(syn), ing)
    for ing in ingredients:
        lookup[_normalize(ing.canonical_name)] = ing
    return lookup


def _normalize(name: str) -> str:
    return " ".join(name.lower().split())


def match_ingredient(raw_name: str, lookup: dict[str, "Ingredient"]) -> "Ingredient | None":
    """
    Return the canonical Ingredient for a label name, or None. Never guesses.

    1. Exact hit on a canonical name or synonym.
    2. A library name appearing as whole words inside the label name, e.g.
       "sodium hyaluronate crosspolymer" → "sodium hyaluronate". The longest
       such name wins.

    The reverse — a short label name found inside a longer library name — is
    never a match: "Oil" is not "Fish Oil", and "Extract" is not any extract.
    """
    norm = _normalize(raw_name)
    if not norm:
        return None
    if norm in lookup:
        return lookup[norm]
    if _EXCIPIENT_WORDS.intersection(re.split(r"[\s,()/-]+", norm)):
        return None

    best: Ingredient | None = None
    best_len = 0
    for key, ing in lookup.items():
        if len(key) < MIN_PARTIAL_KEY_LEN or len(key) <= best_len:
            continue
        if re.search(rf"(?<![\w-]){re.escape(key)}(?![\w-])", norm):
            best, best_len = ing, len(key)
    return best


def infer_status(canonical: "Ingredient | None") -> IngredientStatus | None:
    """
    Status badge for an ingredient row.

    • Not in our library           → None (unknown is not a concern)
    • Reviewed contraindications   → WATCH
    • Otherwise                    → CLEAN

    Belonging to a category (additive, preservative, sweetener) is not by
    itself evidence of a concern, so it no longer earns WATCH. AVOID is only
    ever set by hand or by an explicit regulatory rule.
    """
    if canonical is None:
        return None
    if canonical.contraindications:
        return IngredientStatus.WATCH
    return IngredientStatus.CLEAN
