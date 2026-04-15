"""
Canonical Biodomain definitions for NourAI.

10 health domains that every ingredient can be scored against.
These are the fixed axis of the ingredient → body impact model.

Rules:
  • Never rename keys — they are stored as strings in the DB.
  • Add new domains only with a migration.
  • The goal_tags / concern_tags lists are used to back-populate
    domain scores algorithmically when LLM scoring is unavailable.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class BioDomainDef:
    key: str                          # DB/API key  (snake_case)
    name: str                         # Display name
    description: str                  # One-sentence scope
    goal_tags: list[str]              # Overlapping existing goal_tags
    concern_tags: list[str]           # Overlapping existing concern_tags
    default_weight: float = 1.0       # Future: used for health_score weighting


BIODOMAINS: list[BioDomainDef] = [
    BioDomainDef(
        key="inflammation_immune",
        name="Inflammation & Immune",
        description="Systemic inflammation markers, immune modulation, and oxidative stress.",
        goal_tags=["less_inflammation"],
        concern_tags=["hormonal_condition"],
    ),
    BioDomainDef(
        key="skin_appearance",
        name="Skin & Appearance",
        description="Skin hydration, elasticity, pigmentation, acne, and barrier function.",
        goal_tags=["clear_skin", "anti_aging", "brighter_skin"],
        concern_tags=[],
    ),
    BioDomainDef(
        key="energy_metabolism",
        name="Energy & Metabolism",
        description="Cellular energy production, mitochondrial function, and metabolic rate.",
        goal_tags=["more_energy", "fat_loss"],
        concern_tags=[],
    ),
    BioDomainDef(
        key="gut_digestive",
        name="Gut & Digestive",
        description="Gut microbiome diversity, intestinal permeability, and digestive comfort.",
        goal_tags=["gut_health"],
        concern_tags=[],
    ),
    BioDomainDef(
        key="cognitive_mental",
        name="Cognitive & Mental",
        description="Focus, memory, anxiety, mood, and neurotransmitter support.",
        goal_tags=["mental_focus"],
        concern_tags=[],
    ),
    BioDomainDef(
        key="cardiovascular",
        name="Cardiovascular",
        description="Blood pressure, lipid profile, endothelial function, and heart health.",
        goal_tags=[],
        concern_tags=[],
    ),
    BioDomainDef(
        key="bone_joint",
        name="Bone & Joint",
        description="Bone mineral density, cartilage integrity, and joint mobility.",
        goal_tags=[],
        concern_tags=[],
    ),
    BioDomainDef(
        key="hormonal_endocrine",
        name="Hormonal & Endocrine",
        description="Sex hormones, thyroid function, cortisol, and insulin sensitivity.",
        goal_tags=[],
        concern_tags=["hormonal_condition", "thyroid", "fertility"],
    ),
    BioDomainDef(
        key="body_composition",
        name="Body Composition",
        description="Muscle protein synthesis, fat oxidation, and lean mass retention.",
        goal_tags=["build_muscle", "fat_loss"],
        concern_tags=[],
    ),
    BioDomainDef(
        key="sleep_recovery",
        name="Sleep & Recovery",
        description="Sleep onset, sleep quality, exercise recovery, and HRV.",
        goal_tags=[],
        concern_tags=[],
    ),
]

# Fast lookup by key
BIODOMAIN_BY_KEY: dict[str, BioDomainDef] = {d.key: d for d in BIODOMAINS}
BIODOMAIN_KEYS: list[str] = [d.key for d in BIODOMAINS]

# Study tier weights — used when aggregating evidence into domain scores
STUDY_TIER_WEIGHTS: dict[str, float] = {
    "meta_analysis":     3.0,
    "systematic_review": 2.5,
    "rct":               2.0,
    "cohort":            1.0,
    "case_control":      0.8,
    "cross_sectional":   0.6,
    "review":            0.5,
    "in_vitro":          0.0,   # excluded from scores
    "animal":            0.0,   # excluded from scores
    "case_report":       0.2,
    "other":             0.3,
}

# Confidence multipliers — applied on top of study tier weights
CONFIDENCE_WEIGHTS: dict[str, float] = {
    "high":     1.0,
    "moderate": 0.6,
    "low":      0.2,
}
