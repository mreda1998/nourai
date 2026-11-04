"""Open Food Facts API connector with explicit provenance and licensing."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings
from app.models.product import ProductCategory
from app.services.ingestion.connectors.base import SourceError, SourceInfo, SourceNotFound


class OpenFoodFactsError(SourceError):
    pass


class OpenFoodFactsNotFound(OpenFoodFactsError, SourceNotFound):
    pass


OPEN_FOOD_FACTS = SourceInfo(
    slug="open-food-facts",
    name="Open Food Facts",
    base_url="https://world.openfoodfacts.org",
    license_name="Open Database License",
    license_url="https://opendatacommons.org/licenses/odbl/1-0/",
    attribution="Data and images from Open Food Facts contributors",
    share_alike=True,
    priority=50,
    image_license_name="Creative Commons Attribution-ShareAlike 3.0",
    image_license_url="https://creativecommons.org/licenses/by-sa/3.0/",
)


@dataclass(frozen=True, slots=True)
class SourceImage:
    asset_type: str
    url: str
    language: str = ""


@dataclass(frozen=True, slots=True)
class OpenFoodFactsRecord:
    """A product in Open Food Facts' shape. Other connectors translate their records
    into it, so the pipeline has one format to ingest; `source` says where it came from."""

    barcode: str
    request_url: str
    schema_version: str
    product: dict[str, Any]
    etag: str | None = None
    source: SourceInfo = OPEN_FOOD_FACTS

    @property
    def name(self) -> str:
        return _first_text(
            self.product,
            "product_name_en",
            "product_name",
            "generic_name_en",
            "generic_name",
        )

    @property
    def brand(self) -> str | None:
        return _first_text(self.product, "brands") or None

    @property
    def ingredient_statement(self) -> str | None:
        return _first_text(
            self.product, "ingredients_text_en", "ingredients_text"
        ) or None

    @property
    def category(self) -> ProductCategory:
        tags = " ".join(
            str(value)
            for value in (
                self.product.get("product_type"),
                self.product.get("categories"),
                self.product.get("categories_tags"),
            )
        ).casefold()
        if any(term in tags for term in ("beauty", "cosmetic", "skin care")):
            return ProductCategory.COSMETIC
        if any(term in tags for term in ("medicine", "medication", "over-the-counter")):
            return ProductCategory.OTC
        if any(term in tags for term in ("supplement", "vitamin", "minerals")):
            return ProductCategory.SUPPLEMENT
        return ProductCategory.FOOD

    @property
    def images(self) -> list[SourceImage]:
        images: list[SourceImage] = []
        seen: set[str] = set()
        selected = self.product.get("selected_images")
        if isinstance(selected, dict):
            for role, variants in selected.items():
                if not isinstance(variants, dict):
                    continue
                preferred = variants.get("display") or variants.get("small") or variants
                for language, url in _iter_urls(preferred):
                    if url not in seen:
                        images.append(SourceImage(str(role), url, language))
                        seen.add(url)

        legacy_fields = {
            "front": ("image_front_url", "image_url"),
            "ingredients": ("image_ingredients_url",),
            "nutrition": ("image_nutrition_url",),
            "packaging": ("image_packaging_url",),
        }
        for role, field_names in legacy_fields.items():
            for field in field_names:
                url = self.product.get(field)
                if isinstance(url, str) and url.startswith("http") and url not in seen:
                    images.append(SourceImage(role, url))
                    seen.add(url)
                    break
        return images

    @property
    def nutriments(self) -> dict[str, float]:
        """Classic `<nutrient>_100g` / `_serving` values in grams (kcal/kJ for energy).

        API v3.6 moved label nutrition into `nutrition.aggregated_set` and leaves
        `nutriments` empty; rebuild the classic shape from it so everything
        downstream (measures, scoring) keeps working.
        """
        classic = self.product.get("nutriments")
        if isinstance(classic, dict) and classic:
            return classic
        nutrition = self.product.get("nutrition")
        if not isinstance(nutrition, dict):
            return {}
        out: dict[str, float] = {}
        aggregated = nutrition.get("aggregated_set") or {}
        if aggregated.get("per") == "100g":
            out.update(_label_values(aggregated.get("nutrients"), "_100g", skip_estimates=True))
        serving = _serving_set(nutrition)
        if serving is not None:
            per_serving = _label_values(serving.get("nutrients"), "_serving", skip_estimates=False)
            if not _copies_per_100(out, per_serving, serving.get("per_quantity")):
                out.update(per_serving)
        return out

    @property
    def serving_quantity(self) -> float | None:
        raw = self.product.get("serving_quantity")
        try:
            if raw not in (None, ""):
                return float(raw)
        except (TypeError, ValueError):
            pass
        nutrition = self.product.get("nutrition")
        serving = _serving_set(nutrition) if isinstance(nutrition, dict) else None
        if serving and serving.get("per_unit") in ("g", "ml"):
            try:
                return float(serving.get("per_quantity"))
            except (TypeError, ValueError):
                return None
        return None

    def normalized_payload(self) -> dict[str, Any]:
        return {
            "barcode": self.barcode,
            "name": self.name,
            "brand": self.brand,
            "category": self.category.value,
            "serving_size": self.product.get("serving_size"),
            "ingredient_statement": self.ingredient_statement,
            "ingredients": self.product.get("ingredients") or [],
            "nutriments": self.nutriments,
            "serving_quantity": self.serving_quantity,
            "nutriscore_grade": self.product.get("nutriscore_grade"),
            "nova_group": self.product.get("nova_group"),
            "quantity": self.product.get("quantity"),
            "countries_tags": self.product.get("countries_tags") or [],
            "additives_tags": self.product.get("additives_tags") or [],
        }


class OpenFoodFactsConnector:
    SOURCE_SLUG = OPEN_FOOD_FACTS.slug
    LICENSE_NAME = OPEN_FOOD_FACTS.license_name
    LICENSE_URL = OPEN_FOOD_FACTS.license_url
    IMAGE_LICENSE_NAME = OPEN_FOOD_FACTS.image_license_name
    IMAGE_LICENSE_URL = OPEN_FOOD_FACTS.image_license_url
    ATTRIBUTION = OPEN_FOOD_FACTS.attribution

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    async def fetch_product(self, barcode: str) -> OpenFoodFactsRecord:
        base = settings.openfoodfacts_api_base.rstrip("/")
        url = f"{base}/product/{barcode}.json"
        headers = {"User-Agent": settings.openfoodfacts_request_user_agent}
        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(
            timeout=httpx.Timeout(20.0), follow_redirects=True
        )
        try:
            response = await client.get(
                url,
                params={"product_type": "all"},
                headers=headers,
            )
        except httpx.RequestError as exc:
            raise OpenFoodFactsError(f"Open Food Facts request failed: {exc}") from exc
        finally:
            if owns_client:
                await client.aclose()

        if response.status_code == 404:
            raise OpenFoodFactsNotFound(f"No Open Food Facts product for {barcode}")
        if response.status_code == 429 or response.status_code >= 500:
            raise OpenFoodFactsError(
                f"Open Food Facts temporarily returned HTTP {response.status_code}"
            )
        if response.status_code != 200:
            raise OpenFoodFactsError(
                f"Open Food Facts returned HTTP {response.status_code}"
            )
        try:
            body = response.json()
        except ValueError as exc:
            raise OpenFoodFactsError("Open Food Facts returned invalid JSON") from exc
        product = body.get("product") if isinstance(body, dict) else None
        if not isinstance(product, dict) or not product:
            raise OpenFoodFactsNotFound(f"No Open Food Facts product for {barcode}")
        return OpenFoodFactsRecord(
            barcode=barcode,
            request_url=str(response.request.url),
            schema_version=str(body.get("schema_version") or "3.6"),
            product=product,
            etag=response.headers.get("etag"),
        )


_TO_GRAMS = {"g": 1.0, "mg": 1e-3, "µg": 1e-6, "μg": 1e-6, "mcg": 1e-6, "ug": 1e-6}


def _label_values(nutrients: Any, suffix: str, *, skip_estimates: bool) -> dict[str, float]:
    """`{name: {value, unit, source}}` → `{name<suffix>: value}` in grams (energy stays kcal/kJ)."""
    out: dict[str, float] = {}
    if not isinstance(nutrients, dict):
        return out
    for name, entry in nutrients.items():
        if not isinstance(entry, dict) or entry.get("value") is None:
            continue
        if skip_estimates and entry.get("source") == "estimate":
            continue
        try:
            value = float(entry["value"])
        except (TypeError, ValueError):
            continue
        unit = str(entry.get("unit") or "")
        if unit in ("kcal", "kJ"):
            out[f"{name}{suffix}"] = value
        elif unit in _TO_GRAMS:
            out[f"{name}{suffix}"] = round(value * _TO_GRAMS[unit], 9)
    return out


def _copies_per_100(per_100: dict[str, float], per_serving: dict[str, float], quantity: Any) -> bool:
    """A serving set whose values equal the per-100 values (for a serving that isn't ~100) was
    copied by mistake — e.g. a 330 ml can listing 10.6 g of sugar. Trust the per-100 values."""
    try:
        qty = float(quantity)
    except (TypeError, ValueError):
        return False
    if abs(qty - 100) <= 10:
        return False
    pairs = [
        (per_100[key[: -len("_serving")] + "_100g"], value)
        for key, value in per_serving.items()
        if key[: -len("_serving")] + "_100g" in per_100 and per_100[key[: -len("_serving")] + "_100g"] > 0
    ]
    if not pairs:
        return False
    same = sum(1 for base, value in pairs if abs(value - base) <= 0.02 * base)
    return same / len(pairs) >= 0.8


def _serving_set(nutrition: dict[str, Any]) -> dict[str, Any] | None:
    """The label's per-serving set, as sold, if the product declares one."""
    for item in nutrition.get("input_sets") or []:
        if (
            isinstance(item, dict)
            and item.get("per") == "serving"
            and item.get("preparation", "as_sold") == "as_sold"
            and item.get("source") != "estimate"
        ):
            return item
    return None


def _first_text(product: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = product.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _iter_urls(value: Any, language: str = ""):
    if isinstance(value, str) and value.startswith("http"):
        yield language, value
    elif isinstance(value, dict):
        for key, nested in value.items():
            yield from _iter_urls(nested, str(key))
