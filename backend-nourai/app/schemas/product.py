"""Product Pydantic schemas."""
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field

from app.models.product import IngredientStatus, ProductCategory
from app.schemas.claim import ClaimResponse  # kept for __init__ re-export


# ─── Kept for backwards-compat (used in repositories / __init__) ──────────────

class ProductIngredientResponse(BaseModel):
    """Raw ingredient row — internal use only."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    status: IngredientStatus | None = None
    amount: str | None = None
    unit: str | None = None
    note: str | None = None


# ─── Mobile-facing types ──────────────────────────────────────────────────────

class MobileIngredient(BaseModel):
    """Ingredient shape expected by the mobile Product interface."""

    name: str
    concentration: str | None = None  # e.g. "500 mg"
    tag: str | None = None            # e.g. "avoid", "watch", "clean"
    tag_type: str | None = None       # "warning" when tag is avoid/watch
    description: str | None = None
    ingredient_id: str | None = None  # FK → ingredients.id; present when matched to canonical


class BioDomain(BaseModel):
    name: str
    value: float
    is_negative: bool = False


class Recommendation(BaseModel):
    context: str
    protocol: str


class Citation(BaseModel):
    text: str
    journal: str | None = None


# ─── List-level response (search / browse) ───────────────────────────────────

class ProductResponse(BaseModel):
    """One card in a product list — matches mobile ProductListItem."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    brand: str | None = None
    category: ProductCategory
    image_url: str | None = None
    health_score: int | None = None

    @computed_field
    @property
    def grade(self) -> str:
        if self.health_score is None:
            return "C"
        if self.health_score >= 80:
            return "A"
        if self.health_score >= 60:
            return "B"
        if self.health_score >= 40:
            return "C"
        return "D"

    @computed_field
    @property
    def is_ai_generated(self) -> bool:
        return False


# ─── Detail-level response ────────────────────────────────────────────────────

class ProductWithDetails(BaseModel):
    """Full product — matches mobile Product interface exactly."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    barcode: str | None = None
    name: str
    brand: str | None = None
    category: ProductCategory
    description: str | None = None
    image_url: str | None = None
    grade: str = "C"
    tags: list[str] = []
    has_allergen_warning: bool = False
    allergen_warning: str | None = None
    is_ai_generated: bool = False
    ingredients: list[MobileIngredient] = []
    bio_domains: list[BioDomain] = []
    recommendations: list[Recommendation] = []
    citations: list[Citation] = []

    @classmethod
    def _grade_from_score(cls, score: int | None) -> str:
        if score is None:
            return "C"
        if score >= 80:
            return "A"
        if score >= 60:
            return "B"
        if score >= 40:
            return "C"
        return "D"

    @classmethod
    def from_orm_with_details(cls, product) -> "ProductWithDetails":
        """Convert SQLAlchemy Product model → mobile-compatible response."""

        # ── Ingredients ──────────────────────────────────────────────────────
        ingredients: list[MobileIngredient] = []
        for pi in (product.product_ingredients or []):
            concentration: str | None = None
            if pi.amount:
                concentration = f"{pi.amount} {pi.unit}".strip() if pi.unit else pi.amount

            tag: str | None = None
            tag_type: str | None = None
            if pi.status:
                tag = pi.status if isinstance(pi.status, str) else pi.status.value
                if tag in ("watch", "avoid"):
                    tag_type = "warning"

            ingredients.append(MobileIngredient(
                name=pi.name,
                concentration=concentration,
                tag=tag,
                tag_type=tag_type,
                description=pi.note,
                ingredient_id=str(pi.ingredient_id) if pi.ingredient_id else None,
            ))

        # ── Citations from claim sources ──────────────────────────────────────
        citations: list[Citation] = []
        for claim in (product.claims or []):
            for source in (claim.sources or []):
                if source.summary:
                    citations.append(Citation(
                        text=source.summary,
                        journal=source.label if source.label != claim.title else None,
                    ))

        # ── Biodomain scoring ─────────────────────────────────────────────────
        # Lazy import avoids circular dependency: schemas.product ↔ services.product
        from app.services.biodomain_scorer import score_product_biodomains  # noqa: PLC0415
        domain_scores, computed_health_score = score_product_biodomains(
            product.product_ingredients or []
        )

        bio_domains = [
            BioDomain(
                name=ds.name,
                value=ds.display_value,
                is_negative=ds.is_negative,
            )
            for ds in sorted(domain_scores, key=lambda d: d.display_value, reverse=True)
        ]

        # Prefer computed score; fall back to manually seeded score if no domains found
        effective_score = computed_health_score if domain_scores else product.health_score

        return cls(
            id=product.id,
            barcode=product.barcode,
            name=product.name,
            brand=product.brand,
            category=product.category,
            description=product.summary,
            image_url=product.image_url,
            grade=cls._grade_from_score(effective_score),
            is_ai_generated=False,
            has_allergen_warning=False,
            ingredients=ingredients,
            bio_domains=bio_domains,
            recommendations=[],
            citations=citations,
        )


# ─── Paginated list response ──────────────────────────────────────────────────

class ProductSearchResponse(BaseModel):
    """Paginated product list — wraps ProductResponse items."""

    products: list[ProductResponse]
    total: int
    limit: int
    offset: int
