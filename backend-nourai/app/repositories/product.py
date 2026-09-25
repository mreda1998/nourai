"""Product repository using SQLAlchemy 2.0."""
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.models.product import Product, ProductCategory, ProductIngredient
from app.models.ingestion import ProductIdentifier
from app.models.ingredient import Ingredient
from app.models.claim import Claim
from app.repositories.base import BaseRepository


class ProductRepository(BaseRepository[Product]):
    """Repository for Product entity."""

    model = Product

    async def get_by_barcode(self, barcode: str) -> Product | None:
        """Find product by barcode."""
        result = await self.db.execute(
            select(Product).where(
                Product.barcode == barcode,
                Product.publication_status == "published",
            )
        )
        return result.scalar_one_or_none()

    async def get_with_details(self, id: UUID) -> Product | None:
        """Get product with ingredients (including biodomain scores) and claims."""
        result = await self.db.execute(
            select(Product)
            .where(Product.id == id, Product.publication_status == "published")
            .options(
                selectinload(Product.product_ingredients)
                    .selectinload(ProductIngredient.ingredient)
                    .selectinload(Ingredient.biodomain_scores),
                selectinload(Product.claims).selectinload(Claim.sources),
            )
        )
        return result.scalar_one_or_none()

    async def get_by_barcode_with_details(self, barcode: str) -> Product | None:
        """Get product by barcode with ingredients (including biodomain scores) and claims."""
        result = await self.db.execute(
            select(Product)
            .where(
                Product.barcode == barcode,
                Product.publication_status == "published",
            )
            .options(
                selectinload(Product.product_ingredients)
                    .selectinload(ProductIngredient.ingredient)
                    .selectinload(Ingredient.biodomain_scores),
                selectinload(Product.claims).selectinload(Claim.sources),
            )
        )
        return result.scalar_one_or_none()

    async def get_by_gtin_with_details(self, gtin14: str) -> Product | None:
        """Get a product through its normalized GTIN-14 identifier."""
        result = await self.db.execute(
            select(Product)
            .join(ProductIdentifier, ProductIdentifier.product_id == Product.id)
            .where(
                ProductIdentifier.scheme == "gtin",
                ProductIdentifier.value == gtin14,
                ProductIdentifier.market_country == "",
                Product.publication_status == "published",
            )
            .options(
                selectinload(Product.product_ingredients)
                    .selectinload(ProductIngredient.ingredient)
                    .selectinload(Ingredient.biodomain_scores),
                selectinload(Product.claims).selectinload(Claim.sources),
            )
        )
        return result.scalar_one_or_none()

    async def search(
        self,
        query: str,
        category: ProductCategory | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Product], int]:
        """
        Search products by name or brand.
        Returns (products, total_count).
        """
        search_pattern = f"%{query}%"
        search_filter = or_(
            Product.name.ilike(search_pattern),
            Product.brand.ilike(search_pattern),
        )
        base_query = select(Product).where(
            Product.publication_status == "published",
            search_filter,
        )

        if category:
            base_query = base_query.where(Product.category == category)

        # Count query mirrors base_query filters exactly
        count_query = select(func.count()).select_from(Product).where(
            Product.publication_status == "published",
            search_filter,
        )
        if category:
            count_query = count_query.where(Product.category == category)

        total = (await self.db.execute(count_query)).scalar_one()

        # Get paginated results
        result = await self.db.execute(
            base_query.order_by(Product.health_score.desc().nullslast())
            .limit(limit)
            .offset(offset)
        )
        products = list(result.scalars().all())

        return products, total

    async def get_by_category(
        self,
        category: ProductCategory,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Product]:
        """Get products by category."""
        result = await self.db.execute(
            select(Product)
            .where(
                Product.category == category,
                Product.publication_status == "published",
            )
            .order_by(Product.health_score.desc().nullslast())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def list_products(
        self,
        category: ProductCategory | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[Product], int]:
        """
        List all products with optional category filter.
        Returns (products, total_count).
        """
        base_query = select(Product).where(Product.publication_status == "published")
        count_query = select(func.count()).select_from(Product).where(
            Product.publication_status == "published"
        )

        if category:
            base_query = base_query.where(Product.category == category)
            count_query = count_query.where(Product.category == category)

        total = (await self.db.execute(count_query)).scalar_one()

        result = await self.db.execute(
            base_query.order_by(Product.health_score.desc().nullslast())
            .limit(limit)
            .offset(offset)
        )
        products = list(result.scalars().all())

        return products, total

    async def get_top_rated(
        self,
        category: ProductCategory | None = None,
        limit: int = 10,
    ) -> list[Product]:
        """Get top-rated products by health score."""
        query = select(Product).where(
            Product.health_score.isnot(None),
            Product.publication_status == "published",
        )

        if category:
            query = query.where(Product.category == category)

        result = await self.db.execute(
            query.order_by(Product.health_score.desc()).limit(limit)
        )
        return list(result.scalars().all())
