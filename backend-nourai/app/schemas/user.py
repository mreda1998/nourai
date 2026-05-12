"""User Pydantic schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

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
    scanned_at: datetime


class ScanHistoryResponse(BaseModel):
    """Paginated scan history."""

    items: list[ScanHistoryItemResponse]
    total: int


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
