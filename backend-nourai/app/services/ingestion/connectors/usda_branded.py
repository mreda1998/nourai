"""
USDA FoodData Central connector: US branded foods by GTIN/UPC, with the
ingredient statement and per-100 g nutrients from the label. Public domain.

FDC keeps one record per label revision, under whichever GTIN spelling the
brand submitted (12, 13 or 14 digits); a lookup asks for every spelling and
keeps the most recently published match.
"""
from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings
from app.services.ingestion.connectors.base import SourceError, SourceInfo, SourceNotFound, display_case
from app.services.ingestion.connectors.openfoodfacts import OpenFoodFactsRecord
from app.services.ingestion.normalization import normalize_gtin
from app.services.usda import USDA_BASE, _usda_food_to_off_nutriments

USDA_BRANDED = SourceInfo(
    slug="usda-fooddata-central",
    name="USDA FoodData Central",
    base_url="https://fdc.nal.usda.gov",
    license_name="Public Domain",
    license_url="https://www.usa.gov/government-copyright",
    attribution="U.S. Department of Agriculture, Agricultural Research Service",
    share_alike=False,
    priority=60,
)

_MASS_UNITS = {"g": "g", "grm": "g", "ml": "ml", "mlt": "ml"}
_SUPPLEMENT_WORDS = ("supplement", "vitamin")


def gtin_spellings(barcode: str) -> list[str]:
    gtin14 = normalize_gtin(barcode).gtin14
    if len(gtin14.lstrip("0")) < 6:
        raise ValueError("placeholder barcode")  # brands submit 000000000000 for "none"
    spellings = [gtin14, gtin14[1:]]
    if gtin14.startswith("00"):
        spellings.append(gtin14[2:])
    return spellings


def usda_product(food: dict[str, Any]) -> dict[str, Any]:
    """A branded FDC food (search-result shape) in Open Food Facts' product shape."""
    category = str(food.get("brandedFoodCategory") or food.get("foodCategory") or "")
    size, unit = food.get("servingSize"), str(food.get("servingSizeUnit") or "").lower()
    mass_unit = _MASS_UNITS.get(unit)
    serving_size = food.get("householdServingFullText") or (
        f"{float(size):g} {mass_unit or unit}" if size not in (None, "") else None
    )
    statement = str(food.get("ingredients") or "").strip()
    if statement and not any(ch.islower() for ch in statement):
        statement = statement.capitalize()  # "CHICKEN BREAST, WATER, SALT" reads as shouting
    supplement = any(word in category.lower() for word in _SUPPLEMENT_WORDS)
    return {
        "product_name": display_case(str(food.get("description") or "").strip()),
        "brands": display_case(food.get("brandName") or food.get("brandOwner")),
        "product_type": "food",
        "categories": category,
        "categories_tags": ["en:dietary-supplements"] if supplement else [],
        "ingredients_text": statement or None,
        "nutriments": _usda_food_to_off_nutriments(food),
        "serving_size": serving_size,
        "serving_quantity": float(size) if mass_unit and size not in (None, "") else None,
        "quantity": food.get("packageWeight"),
        "countries_tags": ["en:united-states"] if food.get("marketCountry") in ("United States", "US") else [],
        "fdc_id": food.get("fdcId"),
    }


class USDABrandedConnector:
    source = USDA_BRANDED

    def __init__(self, client: httpx.AsyncClient | None = None, api_key: str | None = None) -> None:
        self._client = client
        self._api_key = settings.usda_api_key if api_key is None else api_key

    async def fetch_product(self, barcode: str) -> OpenFoodFactsRecord:
        if not self._api_key:
            raise SourceNotFound("USDA_API_KEY is not set; branded foods can't be looked up")
        try:
            spellings = gtin_spellings(barcode)
            gtin14 = spellings[0]
        except ValueError as exc:
            raise SourceNotFound(f"USDA can't look up {barcode!r}: {exc}") from exc
        body = {"query": f"gtinUpc:({' OR '.join(spellings)})", "dataType": ["Branded"], "pageSize": 10}
        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=httpx.Timeout(10.0))
        try:
            # POST keeps the key out of logged URLs; GET with dataType trips USDA's WAF.
            response = await client.post(f"{USDA_BASE}/foods/search", params={"api_key": self._api_key}, json=body)
        except httpx.RequestError as exc:
            raise SourceError(f"USDA request failed: {exc}") from exc
        finally:
            if owns_client:
                await client.aclose()
        if response.status_code != 200:
            raise SourceError(f"USDA returned HTTP {response.status_code}")
        try:
            foods = response.json().get("foods") or []
        except ValueError as exc:
            raise SourceError("USDA returned invalid JSON") from exc

        matches = [food for food in foods if _gtin14(food.get("gtinUpc")) == gtin14]
        if not matches:
            raise SourceNotFound(f"No USDA branded food for {barcode}")
        latest = max(matches, key=lambda food: (str(food.get("publishedDate") or ""), int(food.get("fdcId") or 0)))
        return OpenFoodFactsRecord(
            barcode=barcode,
            request_url=f"{USDA_BRANDED.base_url}/food-details/{latest.get('fdcId')}/nutrients",
            schema_version="fdc-branded",
            product=usda_product(latest),
            source=USDA_BRANDED,
        )


def _gtin14(value: Any) -> str | None:
    try:
        return normalize_gtin(str(value or "")).gtin14
    except ValueError:
        return None
