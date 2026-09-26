"""User Pydantic schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

from app.models.user import BiologicalSex, TimeOfDay


class UserProfileResponse(BaseModel):
    """User profile response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str | None = None
    name: str | None = None
    biological_sex: BiologicalSex | None = None
    birth_year: int | None = None
    allergies: list[str] = []
    conditions: list[str] = []
    medications: list[str] = []
    dietary_preferences: list[str] = []
    health_goals: list[str] = []
    # Onboarding profile fields
    age_range: str | None = None
    focus_areas: list[str] = []
    health_concerns: list[str] = []
    is_pregnant: bool = False
    is_breastfeeding: bool = False
    onboarding_completed: bool = False
    onboarding_step: int = 0
    # Extended onboarding profile fields
    sleep_quality: str | None = None
    activity_level: str | None = None
    dietary_pattern: list[str] = []
    environment: str | None = None
    product_categories: list[str] = []


class UserProfileUpdate(BaseModel):
    """User profile update request."""

    name: str | None = None
    biological_sex: BiologicalSex | None = None
    birth_year: int | None = None
    allergies: list[str] | None = None
    conditions: list[str] | None = None
    medications: list[str] | None = None
    dietary_preferences: list[str] | None = None
    health_goals: list[str] | None = None
    # Onboarding profile fields
    age_range: str | None = None
    focus_areas: list[str] | None = None
    health_concerns: list[str] | None = None
    is_pregnant: bool | None = None
    is_breastfeeding: bool | None = None
    onboarding_completed: bool | None = None
    onboarding_step: int | None = None
    # Extended onboarding profile fields
    sleep_quality: str | None = None
    activity_level: str | None = None
    dietary_pattern: list[str] | None = None
    environment: str | None = None
    product_categories: list[str] | None = None


class ScanHistoryItemResponse(BaseModel):
    """A single scan history entry with product details."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    product_name: str
    product_brand: str | None = None
    product_grade: str
    product_category: str = "supplement"
    product_image_url: str | None = None
    scanned_at: datetime


class ScanHistoryResponse(BaseModel):
    """Paginated scan history."""

    items: list[ScanHistoryItemResponse]
    total: int


class SearchHistoryItemResponse(BaseModel):
    """A single search history entry."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    query: str
    result_type: str
    searched_at: datetime


class SearchHistoryResponse(BaseModel):
    """Paginated search history."""

    items: list[SearchHistoryItemResponse]
    total: int


class SearchHistoryCreate(BaseModel):
    """Log a search request."""

    query: str
    result_type: str = "product"


class DailyScoreCategory(BaseModel):
    """One of the 5 display categories that make up the daily score."""

    key: str
    label: str
    value: int


class DailyScoreResponse(BaseModel):
    """Daily Longevity Score for the user's current-day stack."""

    overall: int
    qualifier: str
    categories: list[DailyScoreCategory]


class StackScoreRequest(BaseModel):
    """Products to score — the app sends its current stack (max 50)."""

    product_ids: list[UUID] = Field(default_factory=list, max_length=50)


class HealthDomainFactor(BaseModel):
    """One ingredient's contribution to a single biodomain score."""

    ingredient_name: str
    strength: str  # Strong | Moderate | Limited
    direction: str  # benefit | harm | neutral


class HealthDomainResponse(BaseModel):
    """Single biodomain score + top contributing ingredients from the user's stack."""

    biodomain: str
    label: str
    score: int
    qualifier: str
    factors: list[HealthDomainFactor]


class StackEntryCreate(BaseModel):
    """Create a stack entry request."""

    product_id: UUID
    logged_at: datetime | None = None
    time_of_day: TimeOfDay | None = None
    quantity: float = 1.0
    unit: str | None = None
    notes: str | None = None


class StackEntryResponse(BaseModel):
    """Stack entry response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    logged_at: datetime
    time_of_day: TimeOfDay | None = None
    quantity: float = 1.0
    unit: str | None = None
    notes: str | None = None
    created_at: datetime


class StackEntryWithProduct(StackEntryResponse):
    """Stack entry with product details."""

    product_name: str
    product_brand: str | None = None
    product_image_url: str | None = None
    product_grade: str
    product_category: str = "supplement"
