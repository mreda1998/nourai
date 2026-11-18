"""
Cited reference values that label amounts are measured against.

Every number here comes from a public, named source so the app can show it
behind an (i): FDA Daily Values for nutrients, the EU Reference Intake for
total sugars (the FDA has no total-sugar DV), and NIH Office of Dietary
Supplements upper limits for vitamins and minerals. Adult values throughout.
"""
from dataclasses import dataclass
from typing import Literal

FDA_DV = (
    "FDA Daily Value",
    "https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels",
)
FDA_5_20 = (
    "FDA 5%/20% rule",
    "https://www.fda.gov/food/nutrition-facts-label/how-understand-and-use-nutrition-facts-label",
)
EU_RI = (
    "EU daily reference intake",
    "https://eur-lex.europa.eu/eli/reg/2011/1169/oj",
)
# UK front-of-pack "traffic light" criteria, per 100 g of food. Used alongside
# the per-serving FDA check so a tiny listed serving can't hide a sugary food.
FSA_FOP = (
    "UK Food Standards Agency front-of-pack guidance",
    "https://www.food.gov.uk/business-guidance/packaging-and-labelling",
)
FSA_HIGH_PER_100G: tuple[tuple[str, str, float, float], ...] = (
    # (Open Food Facts key, panel label, grams per 100 g above which it is "high", OFF→grams factor)
    ("sugars", "Sugar", 22.5, 1.0),
    ("saturated-fat", "Saturated fat", 5.0, 1.0),
    ("salt", "Sodium", 1.5, 1.0),        # FSA states salt; we report it on the sodium row
    ("sodium", "Sodium", 1.5, 2.5),      # sodium × 2.5 = salt, when only sodium is given
)
NOVA = (
    "NOVA classification (via Open Food Facts)",
    "https://world.openfoodfacts.org/nova",
)
RESEARCH_LIBRARY = "Elory research library"


def nih_ods(sheet: str) -> str:
    return f"https://ods.od.nih.gov/factsheets/{sheet}-HealthProfessional/"


# ─── Nutrition panel ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class NutrientReference:
    off_key: str               # Open Food Facts nutriment key
    label: str                 # row title
    noun: str                  # used in verdicts and sentences
    kind: Literal["limit", "goal", "reference"]
    value: float               # daily reference, in `unit`
    unit: str
    g_factor: float            # OFF stores grams (kcal for energy); multiply to reach `unit`
    panel_label: str
    source: tuple[str, str]


# Display order: things to limit, then things to get enough of, then context.
NUTRIENT_REFERENCES: tuple[NutrientReference, ...] = (
    NutrientReference("sugars", "Sugar", "sugar", "limit", 90, "g", 1, "Daily sugar reference", EU_RI),
    NutrientReference("added-sugars", "Added sugar", "added sugar", "limit", 50, "g", 1, "Daily added-sugar limit", FDA_DV),
    NutrientReference("saturated-fat", "Saturated fat", "saturated fat", "limit", 20, "g", 1, "Daily saturated fat limit", FDA_DV),
    NutrientReference("sodium", "Sodium", "sodium", "limit", 2300, "mg", 1000, "Daily sodium limit", FDA_DV),
    NutrientReference("fiber", "Fibre", "fibre", "goal", 28, "g", 1, "Daily fibre goal", FDA_DV),
    NutrientReference("proteins", "Protein", "protein", "goal", 50, "g", 1, "Daily protein goal", FDA_DV),
    NutrientReference("energy-kcal", "Calories", "calories", "reference", 2000, "kcal", 1, "Daily calorie reference", FDA_DV),
    NutrientReference("carbohydrates", "Carbs", "carbs", "reference", 275, "g", 1, "Daily carbs reference", FDA_DV),
)


# ─── Vitamins & minerals (supplement doses) ───────────────────────────────────

@dataclass(frozen=True)
class MicronutrientReference:
    key: str
    pattern: str               # regex matched against ingredient names
    dv: float                  # FDA Daily Value
    ul: float | None           # NIH tolerable upper intake level, None when not established
    unit: str                  # unit of both dv and ul
    sheet: str                 # NIH ODS fact sheet slug
    ul_note: str | None = None


MICRONUTRIENT_REFERENCES: tuple[MicronutrientReference, ...] = (
    MicronutrientReference("vitamin_a", r"\bvitamin a\b|retinyl", 900, 3000, "mcg", "VitaminA", "preformed vitamin A"),
    MicronutrientReference("vitamin_c", r"\bvitamin c\b|ascorb", 90, 2000, "mg", "VitaminC"),
    MicronutrientReference("vitamin_d", r"\bvitamin d\d?\b|calciferol", 20, 100, "mcg", "VitaminD"),
    MicronutrientReference("vitamin_e", r"\bvitamin e\b|tocopher", 15, 1000, "mg", "VitaminE", "from supplements"),
    MicronutrientReference("vitamin_k", r"\bvitamin k\d?\b|phylloquinone|menaquinone", 120, None, "mcg", "VitaminK"),
    MicronutrientReference("thiamin", r"thiamin|\bvitamin b-?1\b", 1.2, None, "mg", "Thiamin"),
    MicronutrientReference("riboflavin", r"riboflavin|\bvitamin b-?2\b", 1.3, None, "mg", "Riboflavin"),
    MicronutrientReference("niacin", r"\bniacin\b|nicotinic acid|\bvitamin b-?3\b", 16, 35, "mg", "Niacin", "from supplements"),
    MicronutrientReference("vitamin_b6", r"\bvitamin b-?6\b|pyridox", 1.7, 100, "mg", "VitaminB6"),
    MicronutrientReference("folate", r"folate|folic acid", 400, 1000, "mcg", "Folate", "folic acid"),
    MicronutrientReference("vitamin_b12", r"\bvitamin b-?12\b|cobalamin", 2.4, None, "mcg", "VitaminB12"),
    MicronutrientReference("biotin", r"biotin", 30, None, "mcg", "Biotin"),
    MicronutrientReference("pantothenic_acid", r"pantothen|\bvitamin b-?5\b", 5, None, "mg", "PantothenicAcid"),
    MicronutrientReference("choline", r"\bcholine\b", 550, 3500, "mg", "Choline"),
    MicronutrientReference("calcium", r"\bcalcium\b", 1300, 2500, "mg", "Calcium", "adults 19–50"),
    MicronutrientReference("iron", r"\biron\b|ferrous|ferric", 18, 45, "mg", "Iron"),
    MicronutrientReference("phosphorus", r"\bphosphorus\b", 1250, 4000, "mg", "Phosphorus"),
    MicronutrientReference("iodine", r"iodine|iodide", 150, 1100, "mcg", "Iodine"),
    MicronutrientReference("magnesium", r"magnesium", 420, 350, "mg", "Magnesium", "from supplements"),
    MicronutrientReference("zinc", r"\bzinc\b", 11, 40, "mg", "Zinc"),
    MicronutrientReference("selenium", r"selen", 55, 400, "mcg", "Selenium"),
    MicronutrientReference("copper", r"\bcopper\b|cupric", 0.9, 10, "mg", "Copper"),
    MicronutrientReference("manganese", r"manganese", 2.3, 11, "mg", "Manganese"),
    MicronutrientReference("chromium", r"chromium", 35, None, "mcg", "Chromium"),
    MicronutrientReference("molybdenum", r"molybdenum", 45, 2000, "mcg", "Molybdenum"),
    MicronutrientReference("potassium", r"potassium", 4700, None, "mg", "Potassium"),
)


# ─── Processing ───────────────────────────────────────────────────────────────

NOVA_LABELS = {
    1: "Unprocessed or minimally processed",
    2: "Processed culinary ingredient",
    3: "Processed",
    4: "Ultra-processed",
}
