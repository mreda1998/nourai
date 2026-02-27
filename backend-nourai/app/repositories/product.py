"""Product repository using SQLAlchemy 2.0."""
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.models.product import Product, ProductCategory, ProductIngredient
from app.models.claim import Claim, ClaimSource
from app.repositories.base import BaseRepository


class ProductRepository(BaseRepository[Product]):
    """Repository for Product entity."""

    model = Product

    async def get_by_barcode(self, barcode: str) -> Product | None:
        """Find product by barcode."""
        result = await self.db.execute(
            select(Product).where(Product.barcode == barcode)
        )
        return result.scalar_one_or_none()

    async def get_with_details(self, id: UUID) -> Product | None:
        """Get product with ingredients and claims eagerly loaded."""
        result = await self.db.execute(
            select(Product)
            .where(Product.id == id)
            .options(
                selectinload(Product.product_ingredients),
                selectinload(Product.claims).selectinload(Claim.sources),
            )
        )
        return result.scalar_one_or_none()

    async def get_by_barcode_with_details(self, barcode: str) -> Product | None:
        """Get product by barcode with ingredients and claims."""
        result = await self.db.execute(
            select(Product)
            .where(Product.barcode == barcode)
            .options(
                selectinload(Product.product_ingredients),
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
        base_query = select(Product).where(
            or_(
                Product.name.ilike(search_pattern),
                Product.brand.ilike(search_pattern),
            )
        )

        if category:
            base_query = base_query.where(Product.category == category)

        # Get total count
        count_result = await self.db.execute(
            select(Product.id).where(
                or_(
                    Product.name.ilike(search_pattern),
                    Product.brand.ilike(search_pattern),
                )
            )
        )
        total = len(count_result.all())

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
            .where(Product.category == category)
            .order_by(Product.health_score.desc().nullslast())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def get_top_rated(
        self,
        category: ProductCategory | None = None,
        limit: int = 10,
    ) -> list[Product]:
        """Get top-rated products by health score."""
        query = select(Product).where(Product.health_score.isnot(None))

        if category:
            query = query.where(Product.category == category)

        result = await self.db.execute(
            query.order_by(Product.health_score.desc()).limit(limit)
        )
        return list(result.scalars().all())
