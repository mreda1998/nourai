"""
Nutrient-to-Biodomain weight matrix (Tier 2 scoring).

Maps the 30 USDA standard nutrient display names to biodomain impacts.
These weights represent consensus-level nutritional science — they are NOT
derived from individual PubMed studies (that's what the research agent does
for Tier-1 golden set ingredients).

Used by:
  - app/services/biodomain_scorer.py  (score_nutrient_rows)
  - app/api/v1/foods.py               (USDA virtual product bio_domains)
  - app/schemas/product.py            (DB product Tier-2 supplement)
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NutrientDomainImpact:
    biodomain: str    # one of the 10 BIODOMAIN_KEYS
    direction: str    # "benefit" | "harm"
    magnitude: float  # 0.0–1.0  (consensus strength)
    confidence: str   # "high" | "moderate" | "low"


NUTRIENT_BIODOMAIN_WEIGHTS: dict[str, list[NutrientDomainImpact]] = {
    # ── Macronutrients ──────────────────────────────────────────────────────────
    "Calories": [],
    "Protein": [
        NutrientDomainImpact("body_composition",  "benefit", 0.90, "high"),
        NutrientDomainImpact("energy_metabolism", "benefit", 0.55, "high"),
        NutrientDomainImpact("bone_joint",        "benefit", 0.40, "moderate"),
    ],
    "Total Fat": [
        NutrientDomainImpact("energy_metabolism", "benefit", 0.40, "moderate"),
    ],
    "Saturated Fat": [
        NutrientDomainImpact("cardiovascular",    "harm",    0.60, "moderate"),
    ],
    "Total Carbohydrates": [
        NutrientDomainImpact("energy_metabolism", "benefit", 0.50, "high"),
    ],
    "Dietary Fiber": [
        NutrientDomainImpact("gut_digestive",     "benefit", 0.85, "high"),
        NutrientDomainImpact("cardiovascular",    "benefit", 0.55, "moderate"),
        NutrientDomainImpact("energy_metabolism", "benefit", 0.35, "moderate"),
    ],
    "Sugars": [
        NutrientDomainImpact("energy_metabolism",   "harm",  0.55, "moderate"),
        NutrientDomainImpact("inflammation_immune", "harm",  0.50, "moderate"),
    ],
    "Cholesterol": [],
    "Omega-3": [
        NutrientDomainImpact("cardiovascular",       "benefit", 0.85, "high"),
        NutrientDomainImpact("inflammation_immune",  "benefit", 0.80, "high"),
        NutrientDomainImpact("cognitive_mental",     "benefit", 0.65, "moderate"),
        NutrientDomainImpact("sleep_recovery",       "benefit", 0.45, "moderate"),
    ],
    # ── Electrolytes & minerals ─────────────────────────────────────────────────
    "Sodium": [
        NutrientDomainImpact("cardiovascular",    "harm",    0.70, "high"),
    ],
    "Potassium": [
        NutrientDomainImpact("cardiovascular",    "benefit", 0.75, "high"),
        NutrientDomainImpact("bone_joint",        "benefit", 0.40, "moderate"),
    ],
    "Calcium": [
        NutrientDomainImpact("bone_joint",        "benefit", 0.90, "high"),
        NutrientDomainImpact("cardiovascular",    "benefit", 0.35, "moderate"),
    ],
    "Iron": [
        NutrientDomainImpact("energy_metabolism", "benefit", 0.80, "high"),
        NutrientDomainImpact("cognitive_mental",  "benefit", 0.55, "moderate"),
    ],
    "Magnesium": [
        NutrientDomainImpact("sleep_recovery",    "benefit", 0.75, "moderate"),
        NutrientDomainImpact("cardiovascular",    "benefit", 0.55, "moderate"),
        NutrientDomainImpact("bone_joint",        "benefit", 0.60, "moderate"),
        NutrientDomainImpact("energy_metabolism", "benefit", 0.50, "moderate"),
    ],
    "Phosphorus": [
        NutrientDomainImpact("bone_joint",        "benefit", 0.75, "high"),
        NutrientDomainImpact("energy_metabolism", "benefit", 0.45, "moderate"),
    ],
    "Zinc": [
        NutrientDomainImpact("inflammation_immune",  "benefit", 0.65, "moderate"),
        NutrientDomainImpact("hormonal_endocrine",   "benefit", 0.55, "moderate"),
        NutrientDomainImpact("skin_appearance",      "benefit", 0.50, "moderate"),
    ],
    "Selenium": [
        NutrientDomainImpact("inflammation_immune",  "benefit", 0.55, "moderate"),
        NutrientDomainImpact("hormonal_endocrine",   "benefit", 0.50, "moderate"),
    ],
    # ── Fat-soluble vitamins ────────────────────────────────────────────────────
    "Vitamin A": [
        NutrientDomainImpact("skin_appearance",      "benefit", 0.75, "high"),
        NutrientDomainImpact("inflammation_immune",  "benefit", 0.55, "moderate"),
    ],
    "Vitamin D": [
        NutrientDomainImpact("bone_joint",           "benefit", 0.90, "high"),
        NutrientDomainImpact("inflammation_immune",  "benefit", 0.65, "moderate"),
        NutrientDomainImpact("hormonal_endocrine",   "benefit", 0.60, "moderate"),
        NutrientDomainImpact("cognitive_mental",     "benefit", 0.45, "low"),
    ],
    "Vitamin E": [
        NutrientDomainImpact("skin_appearance",      "benefit", 0.60, "moderate"),
        NutrientDomainImpact("inflammation_immune",  "benefit", 0.55, "moderate"),
        NutrientDomainImpact("cardiovascular",       "benefit", 0.45, "moderate"),
    ],
    "Vitamin K": [
        NutrientDomainImpact("bone_joint",           "benefit", 0.75, "high"),
        NutrientDomainImpact("cardiovascular",       "benefit", 0.50, "moderate"),
    ],
    # ── Water-soluble vitamins ──────────────────────────────────────────────────
    "Vitamin C": [
        NutrientDomainImpact("inflammation_immune",  "benefit", 0.70, "high"),
        NutrientDomainImpact("skin_appearance",      "benefit", 0.65, "moderate"),
    ],
    "Vitamin B12": [
        NutrientDomainImpact("cognitive_mental",     "benefit", 0.75, "high"),
        NutrientDomainImpact("energy_metabolism",    "benefit", 0.70, "high"),
    ],
    "Vitamin B6": [
        NutrientDomainImpact("cognitive_mental",     "benefit", 0.65, "moderate"),
        NutrientDomainImpact("energy_metabolism",    "benefit", 0.60, "high"),
        NutrientDomainImpact("hormonal_endocrine",   "benefit", 0.45, "moderate"),
    ],
    "Niacin": [
        NutrientDomainImpact("energy_metabolism",    "benefit", 0.65, "high"),
        NutrientDomainImpact("cardiovascular",       "benefit", 0.50, "moderate"),
    ],
    "Folate": [
        NutrientDomainImpact("cognitive_mental",     "benefit", 0.55, "moderate"),
        NutrientDomainImpact("cardiovascular",       "benefit", 0.45, "moderate"),
    ],
    "Thiamine": [
        NutrientDomainImpact("energy_metabolism",    "benefit", 0.70, "high"),
        NutrientDomainImpact("cognitive_mental",     "benefit", 0.45, "moderate"),
    ],
    "Riboflavin": [
        NutrientDomainImpact("energy_metabolism",    "benefit", 0.65, "high"),
        NutrientDomainImpact("skin_appearance",      "benefit", 0.40, "moderate"),
    ],
    "Pantothenic Acid": [
        NutrientDomainImpact("energy_metabolism",    "benefit", 0.55, "moderate"),
        NutrientDomainImpact("skin_appearance",      "benefit", 0.40, "low"),
    ],
}


def get_nutrient_impacts(nutrient_name: str) -> list[NutrientDomainImpact]:
    """Return biodomain impacts for a USDA nutrient display name. Returns [] if unknown."""
    return NUTRIENT_BIODOMAIN_WEIGHTS.get(nutrient_name, [])
