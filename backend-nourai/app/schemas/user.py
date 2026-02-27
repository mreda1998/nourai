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
    onboarding_completed: bool = False
    onboarding_step: int = 0


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
    onboarding_completed: bool | None = None
    onboarding_step: int | None = None


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
