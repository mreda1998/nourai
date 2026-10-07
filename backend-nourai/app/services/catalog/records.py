"""
Rows of the catalog index, parsed from the Open Food Facts / Open Beauty Facts
CSV exports. The exports are tab-separated with ~200 columns whose order
differs between the two, so every column is read by its header name.
"""
from __future__ import annotations

import csv
import hashlib
import html
import sys
import unicodedata
from collections.abc import AsyncIterable, AsyncIterator, Iterable, Iterator
from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.countries import OFF_COUNTRY_TO_ISO
from app.services.ingestion.normalization import normalize_gtin

# Ingredient statements in the dump can be hundreds of kilobytes.
csv.field_size_limit(sys.maxsize)

_SUPPLEMENT_TAGS = frozenset({
    "en:dietary-supplements",
    "en:food-supplements",
    "en:vitamins",
    "en:minerals-supplements",
})
_MAX_NAME = 500


@dataclass(frozen=True, slots=True)
class CatalogRow:
    external_id: str
    gtin14: str | None
    name: str
    brand: str | None
    category: str
    countries: tuple[str, ...]
    image_url: str | None
    popularity: int
    completeness: float | None
    source_updated_at: datetime | None
    search_text: str
    content_hash: str
    additives: tuple[str, ...] = ()


def normalize_search_text(*parts: str | None) -> str:
    """Lower-case, accent-free, entity-free, single-spaced text for trigram search."""
    text = " ".join(html.unescape(p) for p in parts if p)
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return " ".join(stripped.casefold().split())


def iter_tsv(lines: Iterable[str]) -> Iterator[dict[str, str]]:
    """Read a tab-separated export row by row, keyed by its header."""
    reader = csv.reader(lines, delimiter="\t", quoting=csv.QUOTE_NONE)
    header = next(reader, None)
    if not header:
        return
    for values in reader:
        yield dict(zip(header, values))


async def aiter_tsv(lines: AsyncIterable[str]) -> AsyncIterator[dict[str, str]]:
    """iter_tsv for a streamed dump: the first line is the header; blank lines are skipped."""
    header: list[str] | None = None
    async for line in lines:
        if not line.strip():
            continue
        values = next(csv.reader([line], delimiter="\t", quoting=csv.QUOTE_NONE), None)
        if values is None:
            continue
        if header is None:
            header = values
            continue
        yield dict(zip(header, values))


def off_countries_to_iso(tags: str) -> tuple[str, ...]:
    seen: list[str] = []
    for tag in _split(tags):
        code = OFF_COUNTRY_TO_ISO.get(tag)
        if code and code not in seen:
            seen.append(code)
    return tuple(seen)


def parse_off_row(row: dict[str, str], *, default_category: str) -> CatalogRow | None:
    """One index row from an OFF/OBF export row, or None when it can't be scanned or named."""
    code = (row.get("code") or "").strip()
    gtin14 = _valid_gtin(code)
    if gtin14 is None:
        return None
    name = _clean(row.get("product_name"))
    if not name:
        return None
    name = name[:_MAX_NAME]
    brands = _split(row.get("brands") or "")
    brand = _clean(brands[0]) if brands else None

    tags = set(_split(row.get("categories_tags") or ""))
    if default_category == "food" and tags & _SUPPLEMENT_TAGS:
        category = "supplement"
    else:
        category = default_category

    countries = off_countries_to_iso(row.get("countries_tags") or "")
    image_url = (row.get("image_url") or "").strip() or (row.get("image_small_url") or "").strip() or None
    popularity = _int(row.get("unique_scans_n"))
    completeness = _float(row.get("completeness"))
    if completeness is not None:
        completeness = min(max(completeness, 0.0), 1.0)
    modified = _int(row.get("last_modified_t"))
    source_updated_at = datetime.fromtimestamp(modified, tz=timezone.utc) if modified else None
    additives = tuple(_split(row.get("additives_tags") or ""))

    fields = (code, gtin14, name, brand, category, countries, image_url, popularity, completeness)
    content_hash = hashlib.sha256(repr(fields).encode("utf-8")).hexdigest()
    return CatalogRow(
        external_id=code,
        gtin14=gtin14,
        name=name,
        brand=brand,
        category=category,
        countries=countries,
        image_url=image_url,
        popularity=popularity,
        completeness=completeness,
        source_updated_at=source_updated_at,
        search_text=normalize_search_text(name, brand),
        content_hash=content_hash,
        additives=additives,
    )


def _valid_gtin(code: str) -> str | None:
    try:
        normalized = normalize_gtin(code)
    except ValueError:
        return None
    significant = normalized.digits.lstrip("0")
    if len(significant) < 6:
        return None  # placeholder and internal numbers
    if significant.startswith("2") and len(normalized.digits) in (8, 12, 13):
        return None  # GS1 restricted circulation: in-store and variable-weight numbers
    return normalized.gtin14


def _clean(value: str | None) -> str | None:
    if not value:
        return None
    text = " ".join(html.unescape(value).split())
    return text or None


def _split(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def _int(value: str | None) -> int:
    try:
        return int(float(value)) if value else 0
    except ValueError:
        return 0


def _float(value: str | None) -> float | None:
    try:
        return float(value) if value else None
    except ValueError:
        return None
