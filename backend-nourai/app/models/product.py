"""Product models using SQLAlchemy 2.0."""
import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.claim import Claim
    from app.models.ingredient import Ingredient


class ProductCategory(str, Enum):
    """Product category enumeration."""

    SUPPLEMENT = "supplement"
    FOOD = "food"
    COSMETIC = "cosmetic"
    OTC = "otc"


class IngredientStatus(str, Enum):
    """Ingredient safety status."""

    CLEAN = "clean"
    WATCH = "watch"
    AVOID = "avoid"


class Product(Base, UUIDMixin, TimestampMixin):
    """Product model representing health/wellness products."""

    __tablename__ = "products"

    barcode: Mapped[str | None] = mapped_column(
        String(20), unique=True, index=True, nullable=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    brand: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[ProductCategory] = mapped_column(
        String(20), nullable=False, default=ProductCategory.SUPPLEMENT
    )
    subcategory: Mapped[str | None] = mapped_column(String(100), nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    serving_size: Mapped[str | None] = mapped_column(String(100), nullable=True)
    servings_per_container: Mapped[int | None] = mapped_column(Integer, nullable=True)
    usage: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_actives: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[str | None] = mapped_column(String(50), nullable=True)
    health_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sugar: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Canonical publication and ingestion metadata. The Product row remains the
    # fast read projection; immutable upstream/formulation history lives in
    # ProductRevision and SourceRecord.
    publication_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="published"
    )
    data_quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_ingested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # JSON fields for flexible data
    marketing_claims: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    scientific_support: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    regulatory_allowances: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    disclaimers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    product_ingredients: Mapped[list["ProductIngredient"]] = relationship(
        "ProductIngredient",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductIngredient.order_position",
    )
    claims: Mapped[list["Claim"]] = relationship(
        "Claim",
        back_populates="product",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_products_health_score", "health_score"),
        Index("ix_products_category", "category"),
        Index(
            "ix_products_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
        Index(
            "ix_products_brand_trgm",
            "brand",
            postgresql_using="gin",
            postgresql_ops={"brand": "gin_trgm_ops"},
        ),
    )

    def __repr__(self) -> str:
        return f"<Product {self.name} ({self.brand})>"


class ProductIngredient(Base, UUIDMixin):
    """Junction table linking products to ingredients with metadata."""

    __tablename__ = "product_ingredients"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    ingredient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ingredients.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[IngredientStatus | None] = mapped_column(String(20), nullable=True)
    amount: Mapped[str | None] = mapped_column(String(50), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    percentage: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_position: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    product: Mapped["Product"] = relationship("Product", back_populates="product_ingredients")
    ingredient: Mapped["Ingredient | None"] = relationship(
        "Ingredient", back_populates="product_ingredients"
    )

    __table_args__ = (
        Index("ix_product_ingredients_product_id", "product_id"),
        Index("ix_product_ingredients_ingredient_id", "ingredient_id"),
    )

    @property
    def effective_status(self) -> str | None:
        """
        Status safe to show users. Older ingestion runs marked every ingredient
        missing from our library as "watch"; an unrecognised ingredient is
        unknown, not a concern, so an unlinked "watch" reads as None.
        """
        if self.status is None:
            return None
        value = self.status if isinstance(self.status, str) else self.status.value
        if value == IngredientStatus.WATCH.value and self.ingredient_id is None:
            return None
        return value

    def __repr__(self) -> str:
        return f"<ProductIngredient {self.name} in {self.product_id}>"
