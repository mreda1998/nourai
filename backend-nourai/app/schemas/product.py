"""Product Pydantic schemas."""
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.product import IngredientStatus, ProductCategory
from app.schemas.claim import ClaimResponse


class ProductIngredientResponse(BaseModel):
    """Ingredient as it appears in a product."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    status: IngredientStatus | None = None
    amount: str | None = None
    unit: str | None = None
    note: str | None = None


class QuickMetric(BaseModel):
    """Quick metric for product display."""

    label: str
    value: str
    meta: str | None = None


class ProductResponse(BaseModel):
    """Basic product response."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    barcode: str | None = None
    name: str
    brand: str | None = None
    category: ProductCategory
    summary: str | None = None
    image_url: str | None = Field(default=None, serialization_alias="heroImage")
    health_score: int | None = Field(default=None, serialization_alias="healthScore")


class ProductWithDetails(BaseModel):
    """Full product response with ingredients and claims."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    barcode: str | None = None
    name: str
    brand: str | None = None
    category: ProductCategory
    summary: str | None = None
    heroImage: str | None = Field(default=None, validation_alias="image_url")
    usage: str | None = None
    servingSize: str | None = Field(default=None, validation_alias="serving_size")
    keyActives: str | None = Field(default=None, validation_alias="key_actives")
    price: str | None = None
    healthScore: int | None = Field(default=None, validation_alias="health_score")
    sugar: str | None = None
    marketingClaims: list[str] | None = Field(default=None, validation_alias="marketing_claims")
    scientificSupport: list[str] | None = Field(
        default=None, validation_alias="scientific_support"
    )
    regulatoryAllowances: list[str] | None = Field(
        default=None, validation_alias="regulatory_allowances"
    )
    disclaimers: list[str] | None = None
    ingredients: list[ProductIngredientResponse] = []
    claims: list[ClaimResponse] = []
    metrics: list[QuickMetric] = []

    @classmethod
    def from_orm_with_details(cls, product) -> "ProductWithDetails":
        """Convert SQLAlchemy model to response with nested data."""
        ingredients = [
            ProductIngredientResponse(
                name=pi.name,
                status=pi.status,
                amount=pi.amount,
                unit=pi.unit,
                note=pi.note,
            )
            for pi in (product.product_ingredients or [])
        ]

        claims = [ClaimResponse.model_validate(claim) for claim in (product.claims or [])]

        # Build metrics from product fields
        metrics = []
        if product.usage:
            metrics.append(QuickMetric(label="Usage", value=product.usage))
        if product.serving_size:
            metrics.append(QuickMetric(label="Serving Size", value=product.serving_size))
        if product.key_actives:
            metrics.append(QuickMetric(label="Key Actives", value=product.key_actives))
        if product.price:
            metrics.append(QuickMetric(label="Price / Size", value=product.price))

        return cls(
            id=product.id,
            barcode=product.barcode,
            name=product.name,
            brand=product.brand,
            category=product.category,
            summary=product.summary,
            heroImage=product.image_url,
            usage=product.usage,
            servingSize=product.serving_size,
            keyActives=product.key_actives,
            price=product.price,
            healthScore=product.health_score,
            sugar=product.sugar,
            marketingClaims=product.marketing_claims,
            scientificSupport=product.scientific_support,
            regulatoryAllowances=product.regulatory_allowances,
            disclaimers=product.disclaimers,
            ingredients=ingredients,
            claims=claims,
            metrics=metrics,
        )


class ProductSearchResponse(BaseModel):
    """Paginated product search response."""

    products: list[ProductResponse]
    total: int
    limit: int
    offset: int
