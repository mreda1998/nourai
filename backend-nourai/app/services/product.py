"""Product service for business logic."""
from uuid import UUID

import httpx

from app.core.config import settings
from app.models.product import Product, ProductCategory
from app.repositories.product import ProductRepository
from app.schemas.product import ProductWithDetails


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
        """
        # Check local database first
        product = await self._repo.get_by_barcode_with_details(barcode)
        if product:
            return product

        # Try fetching from OpenFoodFacts
        product_data = await self._fetch_from_openfoodfacts(barcode)
        if product_data:
            # Create product in our database
            product = await self._repo.create(**product_data)
            return await self._repo.get_with_details(product.id)

        return None

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

    async def _fetch_from_openfoodfacts(self, barcode: str) -> dict | None:
        """Fetch product data from OpenFoodFacts API."""
        url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers={"User-Agent": settings.openfoodfacts_user_agent},
                    timeout=10.0,
                )

                if response.status_code != 200:
                    return None

                data = response.json()
                if data.get("status") != 1:
                    return None

                product = data.get("product", {})
                return self._map_openfoodfacts_product(barcode, product)

        except (httpx.RequestError, KeyError):
            return None

    def _map_openfoodfacts_product(self, barcode: str, data: dict) -> dict:
        """Map OpenFoodFacts data to our product schema."""
        return {
            "barcode": barcode,
            "name": data.get("product_name", "Unknown Product"),
            "brand": data.get("brands"),
            "category": ProductCategory.FOOD,  # Default for OpenFoodFacts products
            "image_url": data.get("image_url"),
            "serving_size": data.get("serving_size"),
            "extra_data": {
                "source": "openfoodfacts",
                "nutriscore_grade": data.get("nutriscore_grade"),
                "nova_group": data.get("nova_group"),
                "ingredients_text": data.get("ingredients_text"),
            },
        }
