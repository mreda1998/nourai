"""Deterministic identifier and ingredient normalization primitives."""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Any


_GTIN_LENGTHS = {8, 12, 13, 14}
_NON_DIGITS = re.compile(r"[\s-]+")
_WHITESPACE = re.compile(r"\s+")
_EDGE_PUNCTUATION = " \t\r\n.,;:*!†‡_()[]{}"


@dataclass(frozen=True, slots=True)
class NormalizedGTIN:
    """A validated scan value and its comparison-safe GTIN-14 form."""

    input_value: str
    digits: str
    gtin14: str


def normalize_gtin(value: str) -> NormalizedGTIN:
    """Validate GTIN-8/UPC-A/EAN-13/GTIN-14 and left-pad to GTIN-14."""
    digits = _NON_DIGITS.sub("", value.strip())
    if not digits.isdigit() or len(digits) not in _GTIN_LENGTHS:
        raise ValueError("Barcode must be a valid GTIN-8, UPC-A, EAN-13, or GTIN-14")

    expected = _check_digit(digits[:-1])
    if int(digits[-1]) != expected:
        raise ValueError("Barcode check digit is invalid")

    return NormalizedGTIN(input_value=value, digits=digits, gtin14=digits.zfill(14))


def _check_digit(body: str) -> int:
    total = sum(
        int(digit) * (3 if position % 2 == 0 else 1)
        for position, digit in enumerate(reversed(body))
    )
    return (10 - total % 10) % 10


def normalize_ingredient_alias(value: str) -> str:
    """Normalize aliases conservatively; never infer that two names are equal."""
    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = normalized.replace("_", " ")
    normalized = _WHITESPACE.sub(" ", normalized)
    return normalized.strip(_EDGE_PUNCTUATION)


def canonical_content_hash(value: Any) -> str:
    """Stable SHA-256 over JSON-compatible data."""
    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()

