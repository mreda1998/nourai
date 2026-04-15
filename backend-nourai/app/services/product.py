"""Product service for business logic."""
import re
from uuid import UUID

import httpx
from sqlalchemy import select

from app.core.config import settings
from app.models.ingredient import Ingredient, IngredientCategory
from app.models.product import Product, ProductCategory, ProductIngredient, IngredientStatus
from app.repositories.product import ProductRepository
from app.schemas.product import ProductWithDetails
from app.services.usda import USDAService, _is_nutriments_sparse


class ProductService:
    """Service for product-related business logic."""

    def __init__(self, product_repository: ProductRepository):
        self._repo = product_repository

    async def get_product(self, id: UUID) -> Product | None:
        """Get a product by ID with all related data."""
        return await self._repo.get_with_details(id)

    async def get_product_by_barcode(self, barcode: str) -> Product | None:
        """
        Get product by barcode, fetching from external API if not found.
        Uses cache-aside pattern.

        For new products fetched from OFF we:
          1. Parse the ingredient list and create ProductIngredient rows
             (with canonical ingredient FK when matched).
          2. Fall back to USDA FoodData Central for nutrition data when
             OFF nutriments are empty/sparse (common for whole/specialty foods).
        """
        # Check local database first
        product = await self._repo.get_by_barcode_with_details(barcode)
        if product:
            return product

        # Try fetching from OpenFoodFacts
        raw_off, product_data = await self._fetch_from_openfoodfacts(barcode)
        if not product_data:
            return None

        # USDA fallback — enrich nutriments when OFF data is sparse
        usda = USDAService()
        nutriments: dict = product_data.get("extra_data", {}).get("nutriments") or {}
        if (
            usda.available
            and product_data.get("category") == ProductCategory.FOOD
            and _is_nutriments_sparse(nutriments)
        ):
            usda_nutriments = await usda.fetch_nutriments(product_data["name"])
            if usda_nutriments:
                product_data["extra_data"]["nutriments"] = usda_nutriments
                product_data["extra_data"]["source"] = "usda"

        # Parse ingredient list from raw OFF response
        ing_names = _parse_off_ingredient_names(raw_off)

        # Create the product row
        product = await self._repo.create(**product_data)

        # Create ProductIngredient rows (with canonical FK when matched)
        if ing_names:
            ingredient_lookup = await self._build_ingredient_lookup()
            async with self._repo.db.begin():
                for position, ing_name in enumerate(ing_names[:60], start=1):
                    canonical = _match_ingredient(ing_name, ingredient_lookup)
                    display_name = ing_name.title()[:500]
                    status = _infer_status(canonical)
                    self._repo.db.add(ProductIngredient(
                        product_id=product.id,
                        name=display_name,
                        ingredient_id=canonical.id if canonical else None,
                        status=status,
                        order_position=position,
                    ))

        return await self._repo.get_with_details(product.id)

    async def _build_ingredient_lookup(self) -> dict[str, Ingredient]:
        """Load canonical ingredients + synonyms into a flat O(1) lookup dict."""
        result = await self._repo.db.execute(select(Ingredient))
        all_ingredients = list(result.scalars().all())
        lookup: dict[str, Ingredient] = {}
        for ing in all_ingredients:
            lookup[ing.canonical_name.lower().strip()] = ing
            for syn in (ing.synonyms or []):
                lookup[syn.lower().strip()] = ing
        return lookup

    async def search_products(
        self,
        query: str,
        category: ProductCategory | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Product], int]:
        """Search products by text query."""
        return await self._repo.search(
            query=query,
            category=category,
            limit=limit,
            offset=offset,
        )

    async def list_products(
        self,
        category: ProductCategory | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[Product], int]:
        """List all products with optional category filter."""
        return await self._repo.list_products(
            category=category,
            limit=limit,
            offset=offset,
        )

    async def get_top_products(
        self,
        category: ProductCategory | None = None,
        limit: int = 10,
    ) -> list[Product]:
        """Get top-rated products by health score."""
        return await self._repo.get_top_rated(category=category, limit=limit)

    async def _fetch_from_openfoodfacts(
        self, barcode: str
    ) -> tuple[dict, dict] | tuple[None, None]:
        """
        Fetch product data from OpenFoodFacts API.
        Returns (raw_off_product, mapped_product_data) or (None, None) on failure.
        The raw dict is kept so the caller can extract ingredient names for
        ProductIngredient row creation.
        """
        url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers={"User-Agent": settings.openfoodfacts_user_agent},
                    timeout=10.0,
                )

                if response.status_code != 200:
                    return None, None

                data = response.json()
                if data.get("status") != 1:
                    return None, None

                raw = data.get("product", {})
                return raw, self._map_openfoodfacts_product(barcode, raw)

        except (httpx.RequestError, KeyError):
            return None, None

    def _map_openfoodfacts_product(self, barcode: str, data: dict) -> dict:
        """Map OpenFoodFacts data to our product schema."""
        return {
            "barcode": barcode,
            "name": data.get("product_name", "Unknown Product"),
            "brand": data.get("brands"),
            "category": ProductCategory.FOOD,
            "image_url": data.get("image_url"),
            "serving_size": data.get("serving_size"),
            "extra_data": {
                "source": "openfoodfacts",
                "nutriscore_grade": data.get("nutriscore_grade"),
                "nova_group": data.get("nova_group"),
                "ingredients_text": data.get("ingredients_text"),
                "nutriments": data.get("nutriments") or {},
                "serving_quantity": data.get("serving_quantity"),
            },
        }


# ─── Ingredient parsing helpers (mirrors fetch_popular_products.py logic) ─────

_SKIP_TOKENS = {
    "water", "aqua", "eau", "purified water", "deionized water",
    "natural flavors", "natural flavours", "artificial flavors",
    "other ingredients", "less than 2% of", "contains less than",
    "ingredients", "ingrédients",
}
_RE_PARENS  = re.compile(r'\([^)]*\)')
_RE_PERCENT = re.compile(r'\d+\.?\d*\s*%')
_RE_SPACES  = re.compile(r'\s+')


def _clean(raw: str) -> str:
    s = _RE_PARENS.sub('', raw)
    s = _RE_PERCENT.sub('', s)
    return _RE_SPACES.sub(' ', s).strip().lower().rstrip('.,;:*†‡')


def _parse_off_ingredient_names(product: dict) -> list[str]:
    """Extract a clean, deduplicated ingredient name list from a raw OFF product dict."""
    structured = product.get("ingredients") or []
    if isinstance(structured, list) and structured:
        names: list[str] = []
        seen: set[str] = set()
        for item in structured:
            text = _clean(item.get("text") or "")
            if text and len(text) >= 3 and text not in _SKIP_TOKENS and text not in seen:
                names.append(text)
                seen.add(text)
        if names:
            return names

    raw = (
        product.get("ingredients_text_en")
        or product.get("ingredients_text")
        or ""
    )
    if not raw:
        return []
    names = []
    seen = set()
    for part in re.split(r'[,;]', raw):
        token = _clean(part)
        if token and len(token) >= 3 and token not in _SKIP_TOKENS and token not in seen:
            names.append(token)
            seen.add(token)
    return names


def _match_ingredient(raw_name: str, lookup: dict[str, Ingredient]) -> Ingredient | None:
    norm = raw_name.lower().strip()
    if norm in lookup:
        return lookup[norm]
    best: Ingredient | None = None
    best_len = 0
    for key, ing in lookup.items():
        if len(key) >= 5 and (key in norm or norm in key) and len(key) > best_len:
            best = ing
            best_len = len(key)
    return best


def _infer_status(canonical: Ingredient | None) -> IngredientStatus:
    if canonical is None:
        return IngredientStatus.WATCH
    if canonical.category in (
        IngredientCategory.ADDITIVE,
        IngredientCategory.PRESERVATIVE,
        IngredientCategory.SWEETENER,
    ):
        return IngredientStatus.WATCH
    if canonical.contraindications:
        return IngredientStatus.WATCH
    return IngredientStatus.CLEAN
