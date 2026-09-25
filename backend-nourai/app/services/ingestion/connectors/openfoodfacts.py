"""Open Food Facts API connector with explicit provenance and licensing."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings
from app.models.product import ProductCategory


class OpenFoodFactsError(RuntimeError):
    pass


class OpenFoodFactsNotFound(OpenFoodFactsError):
    pass


@dataclass(frozen=True, slots=True)
class SourceImage:
    asset_type: str
    url: str
    language: str = ""


@dataclass(frozen=True, slots=True)
class OpenFoodFactsRecord:
    barcode: str
    request_url: str
    schema_version: str
    product: dict[str, Any]
    etag: str | None = None

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

    def normalized_payload(self) -> dict[str, Any]:
        return {
            "barcode": self.barcode,
            "name": self.name,
            "brand": self.brand,
            "category": self.category.value,
            "serving_size": self.product.get("serving_size"),
            "ingredient_statement": self.ingredient_statement,
            "ingredients": self.product.get("ingredients") or [],
            "nutriments": self.product.get("nutriments") or {},
            "nutriscore_grade": self.product.get("nutriscore_grade"),
            "nova_group": self.product.get("nova_group"),
            "quantity": self.product.get("quantity"),
            "countries_tags": self.product.get("countries_tags") or [],
        }


class OpenFoodFactsConnector:
    SOURCE_SLUG = "open-food-facts"
    LICENSE_NAME = "Open Database License"
    LICENSE_URL = "https://opendatacommons.org/licenses/odbl/1-0/"
    IMAGE_LICENSE_NAME = "Creative Commons Attribution-ShareAlike 3.0"
    IMAGE_LICENSE_URL = "https://creativecommons.org/licenses/by-sa/3.0/"
    ATTRIBUTION = "Data and images from Open Food Facts contributors"

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
