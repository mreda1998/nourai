"""Personalization response schemas.

Shape mirrors the TypeScript PersonalAnalysis and IngredientPersonalization
types in nourai/utils/personalization.ts so the mobile client can swap
server results in without any data transformation.
"""
from pydantic import BaseModel, ConfigDict, Field


class ConcernFlag(BaseModel):
    """A single concern flag for one ingredient."""
    concern: str
    label: str


class GoalSupport(BaseModel):
    """A single goal support for one ingredient."""
    goal: str
    label: str


class IngredientPersonalization(BaseModel):
    """Per-ingredient personalization — mirrors TS IngredientPersonalization."""
    concern_flags: list[ConcernFlag] = Field(default_factory=list, alias="concernFlags")
    goal_supports: list[GoalSupport] = Field(default_factory=list, alias="goalSupports")

    model_config = ConfigDict(populate_by_name=True)


class PersonalConcern(BaseModel):
    """One row in the flat concerns list — mirrors TS PersonalAnalysis.concerns."""
    ingredient_name: str = Field(alias="ingredientName")
    concern: str
    label: str

    model_config = ConfigDict(populate_by_name=True)


class PersonalGoal(BaseModel):
    """One row in the flat goals list — mirrors TS PersonalAnalysis.goals."""
    ingredient_name: str = Field(alias="ingredientName")
    goal: str
    label: str

    model_config = ConfigDict(populate_by_name=True)


class PersonalAnalysisResponse(BaseModel):
    """
    Full personalization overlay for a product + user combination.

    - concerns / goals: flat lists for the "For You" warning/goal cards
    - has_concern_flags / has_goal_supports: gate flags (bool) for conditional render
    - per_ingredient: keyed by ingredient name for inline ingredient badges
    - source: "evidence" | "keyword" | "hybrid" | "none"
      "evidence"  — all matches came from PubMed-backed IngredientEvidence rows
      "keyword"   — all matches came from the keyword fallback engine
      "hybrid"    — some evidence-based, some keyword
      "none"      — no matching concerns or goals found
    """
    concerns: list[PersonalConcern] = Field(default_factory=list)
    goals: list[PersonalGoal] = Field(default_factory=list)
    has_concern_flags: bool = Field(alias="hasConcernFlags")
    has_goal_supports: bool = Field(alias="hasGoalSupports")
    per_ingredient: dict[str, IngredientPersonalization] = Field(
        default_factory=dict, alias="perIngredient"
    )
    source: str = "none"

    model_config = ConfigDict(populate_by_name=True)
