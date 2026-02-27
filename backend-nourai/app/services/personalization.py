"""Personalization service — two-tier matching engine.

Tier 1 — Evidence-based (when available):
    Queries IngredientEvidence rows tagged with the user's concern/goal IDs.
    These come from real PubMed studies synthesized by Claude, so they are
    authoritative and citation-backed.

Tier 2 — Keyword fallback (always runs as a complement):
    Pattern-matches raw ingredient names against the same concern/goal taxonomy
    used by the mobile client (utils/personalization.ts).  Covers ingredients
    that haven't been linked to a canonical Ingredient record yet, and products
    ingested from OpenFoodFacts where ingredient_id is NULL.

De-duplication:
    If the same (ingredient, concern) or (ingredient, goal) pair is found by
    both tiers, the evidence-based result takes precedence (richer context).
"""
import uuid
from dataclasses import dataclass, field

from app.models.ingredient_evidence import IngredientEvidence
from app.repositories.personalization import PersonalizationRepository
from app.schemas.personalization import (
    ConcernFlag,
    GoalSupport,
    IngredientPersonalization,
    PersonalAnalysisResponse,
    PersonalConcern,
    PersonalGoal,
)

# ── Keyword pattern tables ────────────────────────────────────────────────────
# Direct port of CONCERN_FLAGS / GOAL_SUPPORT from nourai/utils/personalization.ts.
# Kept in sync manually — if the TS side changes, update here too.

_FlagEntry = tuple[str, str]  # (pattern, label)

CONCERN_FLAGS: dict[str, list[_FlagEntry]] = {
    "fertility": [
        ("paraben", "Endocrine disruptor — fertility risk"),
        ("phthalate", "Endocrine disruptor — fertility risk"),
        ("fragrance", "May contain hidden phthalates"),
        ("bpa", "Endocrine disruptor — fertility risk"),
        ("triclosan", "Hormonal disruption risk"),
        ("oxybenzone", "Systemic absorption — fertility concern"),
        ("benzophenone", "Possible endocrine disruptor"),
        ("phenoxyethanol", "Reproductive toxicant at high doses"),
    ],
    "thyroid": [
        ("soy", "May interfere with thyroid hormone absorption"),
        ("isoflavone", "Phytoestrogen — thyroid caution"),
        ("iodine", "Excess iodine may affect thyroid"),
        ("kelp", "High iodine — thyroid caution"),
        ("selenium", "Excess selenium affects thyroid"),
        ("bromide", "Displaces iodine — thyroid concern"),
    ],
    "hormonal_condition": [
        ("paraben", "Estrogenic activity"),
        ("phthalate", "Endocrine disruption risk"),
        ("fragrance", "May contain estrogenic compounds"),
        ("lavender", "Weak phytoestrogenic activity reported"),
        ("tea tree", "Weak hormonal activity in vitro"),
        ("progesterone", "Exogenous hormone — review with doctor"),
        ("estrogen", "Exogenous hormone — review with doctor"),
        ("bpa", "Strong estrogenic activity"),
    ],
    "medications": [
        ("st. john's wort", "Strong CYP3A4 inducer — drug interaction"),
        ("ginkgo", "Antiplatelet — blood thinner interaction"),
        ("coenzyme q", "May affect blood pressure medications"),
        ("grapefruit", "CYP3A4 inhibitor — medication interaction"),
        ("valerian", "CNS depressant — sedative interaction"),
        ("garlic extract", "Antiplatelet — blood thinner interaction"),
        ("vitamin k", "Interferes with warfarin"),
    ],
    "infant_proximity": [
        ("salicylic", "Avoid skin contact with infants"),
        ("retinol", "Toxic to infants via skin contact"),
        ("retinoic", "Retinoic acid — infant skin risk"),
        ("fragrance", "Sensitizing — keep away from infants"),
        ("glycolic", "Strong acid — infant skin risk"),
        ("lactic acid", "AHA — infant skin caution"),
        ("benzoyl peroxide", "Not for infant proximity"),
        ("essential oil", "Many are sensitizing for infants"),
        ("menthol", "Can cause apnea in infants"),
    ],
}

GOAL_SUPPORT: dict[str, list[_FlagEntry]] = {
    "clear_skin": [
        ("salicylic", "BHA — unclogs pores"),
        ("niacinamide", "Reduces sebum, minimizes pores"),
        ("zinc", "Anti-seborrheic, anti-inflammatory"),
        ("benzoyl", "Kills acne-causing bacteria"),
        ("glycolic", "AHA exfoliant — prevents breakouts"),
        ("tea tree", "Natural antimicrobial"),
        ("sulfur", "Antifungal, reduces sebum"),
        ("azelaic", "Kills P. acnes, reduces inflammation"),
    ],
    "anti_aging": [
        ("retinol", "Increases cell turnover and collagen"),
        ("retinyl", "Vitamin A — anti-aging precursor"),
        ("vitamin c", "Stimulates collagen synthesis"),
        ("ascorbic", "Antioxidant — stimulates collagen"),
        ("hyaluronic", "Plumping — reduces fine lines"),
        ("peptide", "Cell-signaling — collagen production"),
        ("ceramide", "Barrier repair — reduces wrinkle depth"),
        ("collagen", "Structural protein support"),
        ("resveratrol", "SIRT1 activator — anti-aging"),
        ("coenzyme q", "Antioxidant — cellular energy"),
        ("niacinamide", "Improves elasticity, fades fine lines"),
    ],
    "brighter_skin": [
        ("vitamin c", "Inhibits melanin synthesis"),
        ("ascorbic", "Brightening antioxidant"),
        ("niacinamide", "Reduces dark spots and hyperpigmentation"),
        ("arbutin", "Melanin inhibitor"),
        ("kojic", "Tyrosinase inhibitor"),
        ("tranexamic", "Reduces UV-induced pigmentation"),
        ("glycolic", "Exfoliates pigmented cells"),
        ("lactic", "Gentle brightening exfoliant"),
        ("azelaic", "Fades post-acne dark marks"),
    ],
    "hair_growth": [
        ("biotin", "Essential for hair follicle metabolism"),
        ("keratin", "Hair structural protein"),
        ("caffeine", "Stimulates follicle proliferation"),
        ("niacin", "Improves scalp microcirculation"),
        ("zinc", "Supports hair matrix cells"),
        ("rosemary", "Evidence-based follicle stimulant"),
        ("vitamin d", "Follicle cycle regulation"),
    ],
    "prevent_hair_loss": [
        ("biotin", "Supports follicle metabolic health"),
        ("caffeine", "Counteracts DHT at follicle level"),
        ("saw palmetto", "5α-reductase inhibitor"),
        ("zinc", "Prevents follicle miniaturization"),
        ("rosemary", "Comparable to minoxidil in studies"),
        ("pumpkin seed", "DHT-reducing properties"),
    ],
    "build_muscle": [
        ("creatine", "Increases phosphocreatine stores"),
        ("leucine", "mTOR activator — protein synthesis"),
        ("bcaa", "Branch-chain amino acids — anabolism"),
        ("whey", "Fast-absorbing complete protein"),
        ("beta-alanine", "Increases carnosine — endurance"),
        ("hmb", "Anti-catabolic — muscle retention"),
        ("glutamine", "Prevents muscle breakdown"),
    ],
    "fat_loss": [
        ("caffeine", "Thermogenic — raises metabolic rate"),
        ("l-carnitine", "Shuttles fatty acids to mitochondria"),
        ("green tea", "EGCG — thermogenic + caffeine synergy"),
        ("cla", "Conjugated linoleic acid — body composition"),
        ("capsaicin", "Thermogenic — temporary caloric increase"),
        ("chromium", "Reduces carbohydrate cravings"),
    ],
    "more_energy": [
        ("b12", "Essential for cellular energy production"),
        ("cobalamin", "B12 — ATP cycle coenzyme"),
        ("riboflavin", "B2 — electron transport chain"),
        ("coenzyme q", "Mitochondrial electron carrier"),
        ("iron", "Oxygen transport — combats fatigue"),
        ("ashwagandha", "Adaptogen — reduces fatigue"),
        ("caffeine", "Adenosine antagonist — alertness"),
        ("rhodiola", "Adaptogen — reduces mental fatigue"),
        ("magnesium", "ATP synthesis cofactor"),
    ],
    "gut_health": [
        ("lactobacillus", "Probiotic — gut microbiome"),
        ("bifidobacterium", "Probiotic — gut barrier support"),
        ("saccharomyces", "Probiotic yeast — immune modulation"),
        ("inulin", "Prebiotic fiber — feeds beneficial bacteria"),
        ("fos", "Fructooligosaccharide — prebiotic"),
        ("fiber", "Supports microbiome diversity"),
        ("psyllium", "Soluble fiber — gut motility"),
        ("glutamine", "Gut epithelium repair"),
        ("butyrate", "Short-chain fatty acid — colonocyte fuel"),
    ],
    "less_inflammation": [
        ("omega-3", "Potent anti-inflammatory (eicosanoids)"),
        ("epa", "Omega-3 — reduces inflammatory cytokines"),
        ("dha", "Omega-3 — resolves inflammation"),
        ("turmeric", "Traditional anti-inflammatory herb"),
        ("curcumin", "NF-κB inhibitor — anti-inflammatory"),
        ("quercetin", "Flavonoid — inhibits COX enzymes"),
        ("vitamin c", "Antioxidant — reduces oxidative stress"),
        ("zinc", "Anti-inflammatory mineral"),
        ("ginger", "Inhibits inflammatory pathways"),
        ("boswellia", "5-LOX inhibitor — anti-inflammatory"),
    ],
    "mental_focus": [
        ("l-theanine", "Promotes calm focus — synergy with caffeine"),
        ("bacopa", "Nootropic — memory consolidation"),
        ("lion's mane", "NGF stimulator — neuroprotective"),
        ("ginkgo", "Cerebral circulation — cognitive support"),
        ("phosphatidylserine", "Membrane phospholipid — cognition"),
        ("omega-3", "Brain structural lipid — cognition"),
        ("caffeine", "Adenosine antagonist — focus"),
        ("citicoline", "Choline donor — acetylcholine synthesis"),
    ],
}


# ── Internal accumulator ──────────────────────────────────────────────────────

@dataclass
class _IngredientAccum:
    """Mutable accumulator for one ingredient's personalization results."""
    concern_flags: dict[str, ConcernFlag] = field(default_factory=dict)  # concern_id → flag
    goal_supports: dict[str, GoalSupport] = field(default_factory=dict)  # goal_id → support
    has_evidence: bool = False   # True if any flag/support came from DB evidence
    has_keyword: bool = False    # True if any flag/support came from keyword match


# ── Service ───────────────────────────────────────────────────────────────────

class PersonalizationService:
    """
    Builds a PersonalAnalysisResponse for a given product + user profile.

    Usage:
        service = PersonalizationService(repo)
        result = await service.analyze(
            product_id=product.id,
            ingredient_names=["Magnesium Glycinate", "Zinc Picolinate", ...],
            concern_tags=["thyroid", "medications"],
            goal_tags=["more_energy", "gut_health"],
        )
    """

    def __init__(self, repo: PersonalizationRepository) -> None:
        self._repo = repo

    async def analyze(
        self,
        product_id: uuid.UUID,
        ingredient_names: list[str],
        concern_tags: list[str],
        goal_tags: list[str],
    ) -> PersonalAnalysisResponse:
        """
        Run both tiers and return a merged PersonalAnalysisResponse.

        ingredient_names: ordered list of ingredient display names from
                          ProductIngredient.name (used by keyword tier and
                          as the canonical display name in the response).
        """
        if not ingredient_names or (not concern_tags and not goal_tags):
            return PersonalAnalysisResponse(
                has_concern_flags=False,
                has_goal_supports=False,
                source="none",
            )

        # Accumulator: ingredient display name → per-ingredient data
        accum: dict[str, _IngredientAccum] = {}

        # ── Tier 1: evidence-based ────────────────────────────────────────────
        linked_pairs = await self._repo.get_ingredient_ids_for_product(product_id)

        if linked_pairs:
            linked_ids = [iid for iid, _ in linked_pairs]
            # Map canonical ingredient_id → display name
            id_to_display: dict[uuid.UUID, str] = {
                iid: display for iid, display in linked_pairs
            }

            evidence_rows = await self._repo.get_relevant_evidence(
                ingredient_ids=linked_ids,
                concern_tags=concern_tags,
                goal_tags=goal_tags,
            )

            for ev in evidence_rows:
                display_name = id_to_display.get(ev.ingredient_id)
                if not display_name:
                    continue

                if display_name not in accum:
                    accum[display_name] = _IngredientAccum()
                a = accum[display_name]

                # Concern: risk or mixed evidence matching a user concern
                relevant_concerns = [t for t in (ev.concern_tags or []) if t in concern_tags]
                for concern_id in relevant_concerns:
                    if concern_id not in a.concern_flags:
                        # Build label from the finding summary (truncated)
                        label = _truncate(ev.finding, 80)
                        a.concern_flags[concern_id] = ConcernFlag(concern=concern_id, label=label)
                        a.has_evidence = True

                # Goal: benefit evidence matching a user goal
                if ev.direction in ("benefit", "mixed"):
                    relevant_goals = [t for t in (ev.goal_tags or []) if t in goal_tags]
                    for goal_id in relevant_goals:
                        if goal_id not in a.goal_supports:
                            label = _truncate(ev.finding, 80)
                            a.goal_supports[goal_id] = GoalSupport(goal=goal_id, label=label)
                            a.has_evidence = True

        # ── Tier 2: keyword fallback ─────────────────────────────────────────
        # Covers all ingredients (including those without a linked Ingredient).
        # De-duplicates: won't overwrite a slot already filled by evidence.
        for ing_name in ingredient_names:
            name_lower = ing_name.lower()

            for concern_id in concern_tags:
                patterns = CONCERN_FLAGS.get(concern_id, [])
                for pattern, label in patterns:
                    if pattern in name_lower:
                        if ing_name not in accum:
                            accum[ing_name] = _IngredientAccum()
                        a = accum[ing_name]
                        if concern_id not in a.concern_flags:  # don't overwrite evidence
                            a.concern_flags[concern_id] = ConcernFlag(concern=concern_id, label=label)
                            a.has_keyword = True
                        break  # one flag per concern per ingredient

            for goal_id in goal_tags:
                patterns = GOAL_SUPPORT.get(goal_id, [])
                for pattern, label in patterns:
                    if pattern in name_lower:
                        if ing_name not in accum:
                            accum[ing_name] = _IngredientAccum()
                        a = accum[ing_name]
                        if goal_id not in a.goal_supports:  # don't overwrite evidence
                            a.goal_supports[goal_id] = GoalSupport(goal=goal_id, label=label)
                            a.has_keyword = True
                        break  # one support per goal per ingredient

        # ── Build response ────────────────────────────────────────────────────
        concerns: list[PersonalConcern] = []
        goals: list[PersonalGoal] = []
        per_ingredient: dict[str, IngredientPersonalization] = {}

        any_evidence = False
        any_keyword = False

        for ing_name, a in accum.items():
            if not a.concern_flags and not a.goal_supports:
                continue

            any_evidence = any_evidence or a.has_evidence
            any_keyword = any_keyword or a.has_keyword

            for concern_id, flag in a.concern_flags.items():
                concerns.append(PersonalConcern(ingredient_name=ing_name, concern=concern_id, label=flag.label))

            for goal_id, support in a.goal_supports.items():
                goals.append(PersonalGoal(ingredient_name=ing_name, goal=goal_id, label=support.label))

            per_ingredient[ing_name] = IngredientPersonalization(
                concern_flags=list(a.concern_flags.values()),
                goal_supports=list(a.goal_supports.values()),
            )

        # Determine source label
        if any_evidence and any_keyword:
            source = "hybrid"
        elif any_evidence:
            source = "evidence"
        elif any_keyword:
            source = "keyword"
        else:
            source = "none"

        return PersonalAnalysisResponse(
            concerns=concerns,
            goals=goals,
            has_concern_flags=len(concerns) > 0,
            has_goal_supports=len(goals) > 0,
            per_ingredient=per_ingredient,
            source=source,
        )


def _truncate(text: str, max_len: int) -> str:
    """Truncate to max_len chars, appending '…' if cut."""
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"
