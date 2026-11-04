"""What every product connector shares: the errors the job runner understands, and
the provenance and licence that travel with each record a source returns."""
from __future__ import annotations

import re
from dataclasses import dataclass


class SourceError(RuntimeError):
    """The source failed for now (network, rate limit); the job is retried later."""


class SourceNotFound(SourceError):
    """The source holds no record for this barcode."""


@dataclass(frozen=True, slots=True)
class SourceInfo:
    slug: str
    name: str
    base_url: str
    license_name: str
    license_url: str
    attribution: str
    share_alike: bool
    priority: int
    # Sources whose photos are licensed apart from their data (Open Food Facts).
    image_license_name: str | None = None
    image_license_url: str | None = None


def display_case(text: str | None) -> str | None:
    """Title-case an ALL-CAPS label ("CHICKEN BREAST CHUNKS"); leave mixed case alone.

    Government datasets shout; product names in the app shouldn't. Words with
    digits ("SPF50", "2X") and short acronyms keep their capitals.
    """
    if not text:
        return text
    if any(ch.islower() for ch in text):
        return text
    return " ".join(_title_word(word) for word in text.split())


_SEPARATORS = re.compile(r"([-/])")
_ACRONYMS = frozenset({
    "SPF", "UV", "UVA", "UVB", "PA", "USP", "BBQ", "USA", "CVS", "DHA", "EPA", "XL", "XXL",
    "II", "III", "IV", "LLC", "PM", "AM", "HD", "DDS", "MD",
})


def _title_word(word: str) -> str:
    # Each part of "ANTI-DANDRUFF" or "UVA/UVB" is its own word.
    return "".join(_title_part(part) for part in _SEPARATORS.split(word))


def _title_part(part: str) -> str:
    core = part.strip("()[],.;:!")
    if core in _ACRONYMS or any(ch.isdigit() for ch in core):
        return part
    # Capitalise the first letter only: "JOE'S" → "Joe's", not "Joe'S".
    lowered = part.lower()
    for i, ch in enumerate(lowered):
        if ch.isalpha():
            return lowered[:i] + ch.upper() + lowered[i + 1:]
    return lowered
