"""
Clean a label ingredient name for lookup. Conservative: it removes markup
and obvious noise, flags junk, and offers a singular form — it never decides
that two different names mean the same substance.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.ingestion.normalization import normalize_ingredient_alias

_E_NUMBER = re.compile(r"^(e\s?\d{3,4}[a-z]?)(?:\s*[-–:]\s*|\s*$)", re.IGNORECASE)
# "dont acides gras 7.0g saturés", "of which sugars 5 g" — nutrition text parsed as an ingredient
_NUTRITION = re.compile(r"\b(dont|of which|davon|di cui|de los cuales)\b|\d+(?:[.,]\d+)?\s?(g|mg|kcal|kj)\b", re.IGNORECASE)
_HEADINGS = {"ingredients", "ingrédients", "ingredienti", "zutaten", "ingredientes", "contains", "contient"}
_ONLY_NUMBER = re.compile(r"^[\d.,\s%]+$")


@dataclass(frozen=True)
class CleanName:
    normalized: str
    junk: bool = False
    e_number: str | None = None
    singular: str | None = None


def _singular(text: str) -> str | None:
    """French/English plural words → singular, word by word ("huiles végétales" → "huile végétale")."""
    words = text.split(" ")
    out, changed = [], False
    for w in words:
        if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            out.append(w[:-1])
            changed = True
        elif len(w) > 3 and w.endswith("x") and w[-2] in "au":  # "végétaux" → "végétal"
            out.append(w[:-2] + "l" if w.endswith("aux") else w[:-1])
            changed = True
        else:
            out.append(w)
    return " ".join(out) if changed else None


def clean_name(raw: str) -> CleanName:
    text = normalize_ingredient_alias(raw or "")
    e_number = None
    m = _E_NUMBER.match(text)
    if m:
        e_number = m.group(1).replace(" ", "")
        text = text[m.end():].strip() or e_number
    junk = (
        not text
        or text in _HEADINGS
        or bool(_ONLY_NUMBER.match(text))
        or (bool(_NUTRITION.search(text)) and not re.search(r"vitamin|b\d", text))
    )
    return CleanName(normalized=text, junk=junk, e_number=e_number, singular=_singular(text))
