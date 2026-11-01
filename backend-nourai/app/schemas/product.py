"""Product Pydantic schemas."""
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field

from app.models.product import IngredientStatus, ProductCategory
from app.schemas.claim import ClaimResponse  # kept for __init__ re-export
from app.schemas.measure import AdditivesSummary, Measure, NutritionPanel, ProcessingInfo

# ─── Bio-domain scoring ───────────────────────────────────────────────────────
# Delegated to app/services/biodomain_scorer.py.
# That module implements dose-aware, LLM-scored per-ingredient per-domain
# impact aggregation — see biodomain_scorer.py for the full algorithm.


# ─── Kept for backwards-compat (used in repositories / __init__) ──────────────


def grade_from_score(score: int | None) -> str | None:
    """Letter grade for a 0-100 score; None when nothing has been rated.

    Unrated products used to default to "C", so every product showed the same grade.
    """
    if score is None:
        return None
    if score >= 80:
        return "A"
    if score >= 60:
        return "B"
    if score >= 40:
        return "C"
    return "D"

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
    is_nutrient: bool = False         # True for rows sourced from OFF nutriments panel


# ─── Nutrition facts parsing ──────────────────────────────────────────────────
# Maps Open Food Facts nutriment key → (display_name, unit, g_to_unit_factor, daily_value)
# g_to_unit_factor: multiply the raw grams value from OFF by this to reach the display unit.
# Special case: "energy-kcal" is already in kcal (not grams), so factor = 1.
_NUTRIENT_CONFIG: dict[str, tuple[str, str, float, float | None]] = {
    "energy-kcal":      ("Calories",            "kcal", 1.0,         None),
    "proteins":         ("Protein",             "g",    1.0,         50.0),
    "fat":              ("Total Fat",           "g",    1.0,         78.0),
    "saturated-fat":    ("Saturated Fat",       "g",    1.0,         20.0),
    "carbohydrates":    ("Total Carbohydrates", "g",    1.0,         275.0),
    "fiber":            ("Dietary Fiber",       "g",    1.0,         28.0),
    "sugars":           ("Sugars",              "g",    1.0,         50.0),
    "cholesterol":      ("Cholesterol",         "mg",   1_000.0,     300.0),
    "sodium":           ("Sodium",              "mg",   1_000.0,     2_300.0),
    "potassium":        ("Potassium",           "mg",   1_000.0,     4_700.0),
    "calcium":          ("Calcium",             "mg",   1_000.0,     1_300.0),
    "iron":             ("Iron",                "mg",   1_000.0,     18.0),
    "magnesium":        ("Magnesium",           "mg",   1_000.0,     420.0),
    "phosphorus":       ("Phosphorus",          "mg",   1_000.0,     1_250.0),
    "zinc":             ("Zinc",                "mg",   1_000.0,     11.0),
    "selenium":         ("Selenium",            "µg",   1_000_000.0, 55.0),
    "vitamin-a":        ("Vitamin A",           "µg",   1_000_000.0, 900.0),
    "vitamin-c":        ("Vitamin C",           "mg",   1_000.0,     90.0),
    "vitamin-d":        ("Vitamin D",           "µg",   1_000_000.0, 20.0),
    "vitamin-e":        ("Vitamin E",           "mg",   1_000.0,     15.0),
    "vitamin-k":        ("Vitamin K",           "µg",   1_000_000.0, 120.0),
    "vitamin-b12":      ("Vitamin B12",         "µg",   1_000_000.0, 2.4),
    "vitamin-b6":       ("Vitamin B6",          "mg",   1_000.0,     1.7),
    "niacin":           ("Niacin",              "mg",   1_000.0,     16.0),
    "pantothenic-acid": ("Pantothenic Acid",    "mg",   1_000.0,     5.0),
    "thiamin":          ("Thiamine",            "mg",   1_000.0,     1.2),
    "riboflavin":       ("Riboflavin",          "mg",   1_000.0,     1.3),
    "folates":          ("Folate",              "µg",   1_000_000.0, 400.0),
    "omega-3-fat":      ("Omega-3",             "g",    1.0,         None),
}

# Display order — macros first, then micros
_NUTRIENT_ORDER = [
    "energy-kcal", "proteins", "fat", "saturated-fat", "carbohydrates",
    "fiber", "sugars", "cholesterol", "sodium",
    "vitamin-a", "vitamin-c", "vitamin-d", "vitamin-e", "vitamin-k",
    "vitamin-b12", "vitamin-b6", "niacin", "riboflavin", "thiamin",
    "folates", "pantothenic-acid",
    "calcium", "iron", "magnesium", "phosphorus", "potassium",
    "zinc", "selenium", "omega-3-fat",
]

NUTRIENT_DISPLAY_NAMES: frozenset[str] = frozenset(
    config[0].casefold() for config in _NUTRIENT_CONFIG.values()
)


def _parse_nutriments(
    extra_data: dict,
    ingredient_lookup: dict[str, str] | None = None,
) -> list[MobileIngredient]:
    """
    Convert Open Food Facts `nutriments` dict → MobileIngredient list (is_nutrient=True).

    Prefers per-serving values when available (key ending in _serving),
    falls back to per-100g. Includes % Daily Value for nutrients with a known DV.
    Skips zero or missing values.

    ingredient_lookup: optional {lowercased_name: str(uuid)} — when provided,
    nutrient display names are matched against it so ingredient_id FKs are populated
    and the mobile client can navigate from the nutrition panel to ingredient deep dives.
    """
    nutriments: dict = extra_data.get("nutriments") or {}
    if not nutriments:
        return []

    results: list[MobileIngredient] = []

    for key in _NUTRIENT_ORDER:
        config = _NUTRIENT_CONFIG.get(key)
        if not config:
            continue
        display_name, unit, factor, dv = config

        # Prefer per-serving, fall back to per-100g
        raw = nutriments.get(f"{key}_serving") if f"{key}_serving" in nutriments else nutriments.get(f"{key}_100g")
        if raw is None:
            continue
        try:
            raw_val = float(raw)
        except (ValueError, TypeError):
            continue
        if raw_val <= 0:
            continue

        # Convert to display unit
        display_val = raw_val if key == "energy-kcal" else raw_val * factor

        # Format the number
        if unit in ("g", "kcal"):
            formatted_num = f"{display_val:.0f}" if display_val >= 10 else f"{display_val:.1f}"
        elif unit == "mg":
            if display_val >= 10:
                formatted_num = f"{display_val:.0f}"
            elif display_val >= 1:
                formatted_num = f"{display_val:.1f}"
            else:
                formatted_num = f"{display_val:.2f}"
        else:  # µg
            formatted_num = f"{display_val:.1f}"

        concentration = f"{formatted_num} {unit}"

        # Append % DV when known and > 0%
        if dv and display_val > 0:
            pct_dv = round((display_val / dv) * 100)
            if pct_dv > 0:
                concentration += f" ({pct_dv}% DV)"

        ingredient_id: str | None = None
        if ingredient_lookup:
            ingredient_id = ingredient_lookup.get(display_name.lower().strip())

        results.append(MobileIngredient(
            name=display_name,
            concentration=concentration,
            is_nutrient=True,
            ingredient_id=ingredient_id,
        ))

    return results


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


class ProductAttribution(BaseModel):
    source_name: str
    source_url: str
    attribution_text: str
    data_license_name: str | None = None
    data_license_url: str | None = None
    image_license_name: str | None = None
    image_license_url: str | None = None


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
    def grade(self) -> str | None:
        return grade_from_score(self.health_score)

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
    grade: str | None = None  # None until the product has been rated: never a made-up default
    tags: list[str] = []
    has_allergen_warning: bool = False
    allergen_warning: str | None = None
    is_ai_generated: bool = False
    ingredients: list[MobileIngredient] = []
    bio_domains: list[BioDomain] = []
    recommendations: list[Recommendation] = []
    citations: list[Citation] = []
    attribution: ProductAttribution | None = None
    # Structured measures (bars). The legacy `ingredients` nutrient rows stay for older builds.
    nutrition: NutritionPanel | None = None
    doses: list[Measure] = []
    additives: AdditivesSummary | None = None
    processing: ProcessingInfo | None = None

    @classmethod
    def from_orm_with_details(
        cls,
        product,
        ingredient_lookup: dict[str, str] | None = None,
    ) -> "ProductWithDetails":
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

        # ── Nutrition facts ───────────────────────────────────────────────────
        # Parse first so nutrient rows are available for Tier-2 biodomain scoring.
        nutrient_items: list[MobileIngredient] = []
        if product.category == ProductCategory.FOOD and product.extra_data:
            nutrient_items = _parse_nutriments(product.extra_data, ingredient_lookup)
            ingredients.extend(nutrient_items)

        # ── Measures (bars) ───────────────────────────────────────────────────
        # Lazy imports avoid circular dependency: schemas.product ↔ services.*
        from app.services.measures import (  # noqa: PLC0415
            build_additives_summary,
            build_dose_measure,
            build_nutrition_panel,
            build_processing,
        )

        extra = product.extra_data or {}
        rows = product.product_ingredients or []
        nutrition = None
        processing = None
        if product.category == ProductCategory.FOOD:
            nutrition = build_nutrition_panel(
                extra.get("nutriments"),
                extra.get("serving_quantity"),
                getattr(product, "serving_size", None) or extra.get("serving_size"),
            )
            processing = build_processing(extra)
        doses: list[Measure] = []
        if product.category == ProductCategory.SUPPLEMENT:
            for pi, mobile in zip(rows, ingredients):
                canonical = getattr(pi, "ingredient", None)
                measure = build_dose_measure(
                    pi.name,
                    mobile.concentration,
                    canonical_name=getattr(canonical, "canonical_name", None),
                    typical_dose_range=getattr(canonical, "typical_dose_range", None),
                    ingredient_id=mobile.ingredient_id,
                )
                if measure:
                    doses.append(measure)
        additives = build_additives_summary(rows) if rows else None

        # ── Biodomain scoring ─────────────────────────────────────────────────
        from app.services.biodomain_scorer import (  # noqa: PLC0415
            score_product_biodomains,
            score_nutrient_rows,
            merge_domain_scores,
        )

        # Tier-1: PubMed-backed scores from canonical ingredient_biodomain_scores
        tier1_scores, computed_health_score = score_product_biodomains(
            product.product_ingredients or []
        )

        # Tier-2: weight matrix scores from the nutrition panel (food products only)
        tier2_scores = score_nutrient_rows(nutrient_items) if nutrient_items else []

        # Merge: Tier-1 wins per domain, Tier-2 fills the gaps
        domain_scores = merge_domain_scores(tier1_scores, tier2_scores)

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
        source = (product.extra_data or {}).get("source")
        attribution = None
        if source in {"openfoodfacts", "open-food-facts"}:
            barcode = product.barcode or ""
            attribution = ProductAttribution(
                source_name="Open Food Facts",
                source_url=f"https://world.openfoodfacts.org/product/{barcode}",
                attribution_text="Data and images from Open Food Facts contributors",
                data_license_name="Open Database License",
                data_license_url="https://opendatacommons.org/licenses/odbl/1-0/",
                image_license_name="CC BY-SA 3.0",
                image_license_url="https://creativecommons.org/licenses/by-sa/3.0/",
            )

        return cls(
            id=product.id,
            barcode=product.barcode,
            name=product.name,
            brand=product.brand,
            category=product.category,
            description=product.summary,
            image_url=product.image_url,
            grade=grade_from_score(effective_score),
            is_ai_generated=False,
            has_allergen_warning=False,
            ingredients=ingredients,
            bio_domains=bio_domains,
            recommendations=[],
            citations=citations,
            attribution=attribution,
            nutrition=nutrition,
            doses=doses,
            additives=additives,
            processing=processing,
        )


# ─── Search results (curated products + catalog index) ──────────────────────

class SearchResultItem(BaseModel):
    """One search hit. `id` is a product UUID, or `catalog:<n>` for an index entry not yet hydrated."""

    id: str
    name: str
    brand: str | None = None
    category: str
    image_url: str | None = None
    grade: str | None = None          # None until we hold the full product
    is_ai_generated: bool = False
    in_catalog_only: bool = False


class ProductSearchResultsResponse(BaseModel):
    products: list[SearchResultItem]
    total: int
    limit: int
    offset: int


# ─── Paginated list response ──────────────────────────────────────────────────

class ProductSearchResponse(BaseModel):
    """Paginated product list — wraps ProductResponse items."""

    products: list[ProductResponse]
    total: int
    limit: int
    offset: int
