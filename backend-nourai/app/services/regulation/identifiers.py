"""Keys that label names, INCI names and E-numbers are matched on."""
from __future__ import annotations

import re

from app.services.ingestion.normalization import normalize_ingredient_alias

_E_NUMBER = re.compile(r"^(?:E|INS)(\d{3,4}[A-Z]*)$")

# Functional class prefixes labels put before an additive ("Colour: titanium dioxide").
_FUNCTION_PREFIXES = (
    "colour", "color", "colorant", "colorants", "colourant", "emulsifier", "émulsifiant",
    "preservative", "conservateur", "antioxidant", "antioxydant", "sweetener", "édulcorant",
    "stabiliser", "stabilizer", "thickener", "épaississant", "acidity regulator",
    "correcteur d'acidité", "farbstoff", "colorante",
)
_PREFIX = re.compile(
    r"^\s*(?:" + "|".join(re.escape(p) for p in _FUNCTION_PREFIXES) + r")s?\s*:\s*", re.IGNORECASE
)


def normalize_e_number(raw: str) -> str | None:
    """`en:e171` → `E171`, `e322(i)` → `E322I`, `INS 102` → `E102`; anything else → None."""
    value = raw.strip()
    if value.lower().startswith("en:"):
        value = value[3:]
    value = re.sub(r"[\s.()\-]", "", value).upper()
    match = _E_NUMBER.match(value)
    return f"E{match.group(1)}" if match else None


def alias_key(alias: str, alias_type: str) -> str:
    """The key an alias is stored and looked up under."""
    if alias_type == "e_number":
        return normalize_e_number(alias) or normalize_ingredient_alias(alias)
    if alias_type == "name":
        alias = _PREFIX.sub("", alias)
    return normalize_ingredient_alias(alias)
