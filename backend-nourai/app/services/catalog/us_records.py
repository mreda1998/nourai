"""
Catalog rows from two US government dumps:

- openFDA's NDC directory (one JSON file in a zip): over-the-counter listings
  that are personal care — sunscreen, toothpaste, antiperspirant, acne care —
  one row per UPC.
- USDA FoodData Central's Branded Foods (CSVs in a zip): one row per GTIN,
  from its latest label revision. branded_food.csv holds the barcode and brand,
  food.csv the product name, so the dump is read in two passes.

Both are public domain and US-only, and neither has scan counts or photos.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import sys
import zipfile
from collections.abc import Iterator
from datetime import datetime, timezone
from typing import Any

from app.services.catalog.records import CatalogRow, _valid_gtin, normalize_search_text
from app.services.ingestion.connectors.base import display_case
from app.services.ingestion.connectors.openfda import is_personal_care

csv.field_size_limit(sys.maxsize)

_MAX_NAME = 500
_USDA_COUNTRIES = {"United States": "US", "US": "US", "New Zealand": "NZ"}
_SUPPLEMENT_WORDS = ("supplement", "vitamin")


def iter_openfda_ndc(path: str) -> Iterator[dict[str, Any]]:
    """Each OTC listing that carries a UPC, once per UPC."""
    with zipfile.ZipFile(path) as archive:
        name = next(n for n in archive.namelist() if n.endswith(".json"))
        with archive.open(name) as handle:
            listings = json.load(handle).get("results") or []
    for listing in listings:
        if listing.get("product_type") != "HUMAN OTC DRUG":
            continue
        for upc in (listing.get("openfda") or {}).get("upc") or []:
            yield {**listing, "upc": upc}


def parse_openfda_row(listing: dict[str, Any]) -> CatalogRow | None:
    gtin14 = _valid_gtin(str(listing.get("upc") or ""))
    if gtin14 is None or not is_personal_care(listing) or listing.get("marketing_end_date"):
        return None
    name = " ".join(p for p in (listing.get("brand_name"), listing.get("brand_name_suffix")) if p).strip()
    name = display_case(name or listing.get("generic_name") or "")
    if not name:
        return None
    brand = display_case(listing.get("labeler_name")) or None
    return _row(gtin14, name, brand, "cosmetic", ("US",), _date(listing.get("marketing_start_date")))


def iter_usda_branded(path: str) -> Iterator[dict[str, Any]]:
    """The latest revision of each branded GTIN still on sale, with its product name."""
    with zipfile.ZipFile(path) as archive:
        branded = _member(archive, "branded_food.csv")
        food = _member(archive, "food.csv")
        latest: dict[str, tuple] = {}
        for row in _read_csv(archive, branded):
            gtin14 = _usda_gtin(row.get("gtin_upc") or "")
            if gtin14 is None:
                continue
            key = (row.get("available_date") or "", int(row.get("fdc_id") or 0))
            held = latest.get(gtin14)
            if held is None or key > held[0]:
                # A tuple, not the row: ~470k of these stay in memory until the second pass.
                latest[gtin14] = (
                    key, row.get("brand_name") or "", row.get("brand_owner") or "",
                    row.get("branded_food_category") or "", row.get("market_country") or "",
                    bool(row.get("discontinued_date")),
                )
        wanted = {held[0][1]: gtin14 for gtin14, held in latest.items() if not held[5]}
        names: dict[str, str] = {}
        for row in _read_csv(archive, food):
            gtin14 = wanted.get(int(row.get("fdc_id") or 0))
            if gtin14 is not None:
                names[gtin14] = row.get("description") or ""
    for gtin14, (key, brand_name, brand_owner, category, country, discontinued) in latest.items():
        if discontinued:
            continue
        yield {
            "gtin14": gtin14, "fdc_id": key[1], "available_date": key[0], "description": names.get(gtin14, ""),
            "brand_name": brand_name, "brand_owner": brand_owner, "category": category, "market_country": country,
        }


def parse_usda_row(row: dict[str, Any]) -> CatalogRow | None:
    gtin14 = _valid_gtin(row.get("gtin14") or "")
    name = display_case(" ".join(str(row.get("description") or "").split()))
    if gtin14 is None or not name:
        return None
    brand = display_case(row.get("brand_name") or row.get("brand_owner") or "") or None
    category = str(row.get("category") or "").lower()
    kind = "supplement" if any(word in category for word in _SUPPLEMENT_WORDS) else "food"
    country = _USDA_COUNTRIES.get(row.get("market_country") or "", "US")
    return _row(gtin14, name, brand, kind, (country,), _date(row.get("available_date")))


def _row(gtin14: str, name: str, brand: str | None, category: str, countries: tuple[str, ...],
         updated: datetime | None) -> CatalogRow:
    name = name[:_MAX_NAME]
    fields = (gtin14, name, brand, category, countries)
    return CatalogRow(
        external_id=gtin14,
        gtin14=gtin14,
        name=name,
        brand=brand,
        category=category,
        countries=countries,
        image_url=None,
        popularity=0,
        completeness=None,
        source_updated_at=updated,
        search_text=normalize_search_text(name, brand),
        content_hash=hashlib.sha256(repr(fields).encode("utf-8")).hexdigest(),
    )


def _usda_gtin(raw: str) -> str | None:
    digits = raw.strip()
    # ~45k UPC-As were submitted without their leading zero.
    if len(digits) == 11 and digits.isdigit():
        digits = digits.zfill(12)
    return _valid_gtin(digits)


def _member(archive: zipfile.ZipFile, filename: str) -> str:
    return next(n for n in archive.namelist() if n.rsplit("/", 1)[-1] == filename)


def _read_csv(archive: zipfile.ZipFile, member: str) -> Iterator[dict[str, str]]:
    with archive.open(member) as handle:
        yield from csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8", newline=""))


def _date(value: Any) -> datetime | None:
    text = str(value or "").replace("-", "")
    try:
        return datetime.strptime(text[:8], "%Y%m%d").replace(tzinfo=timezone.utc) if len(text) >= 8 else None
    except ValueError:
        return None
