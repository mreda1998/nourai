"""
Application configuration using Pydantic Settings.

Centralizes all configuration with environment variable support.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database - PostgreSQL via Supabase
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"

    # Supabase Auth + Storage
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_service_role_key: str = ""  # Project Settings → API → service_role key
    supabase_storage_bucket: str = "product-images"
    supabase_structure_bucket: str = "ingredient-structures"
    # Private bucket for tester product submissions (label photos)
    supabase_submissions_bucket: str = "tester-submissions"
    submission_daily_limit: int = 20  # per device, rolling 24 h

    # RevenueCat
    revenuecat_webhook_secret: str = ""  # Exact Authorization header configured in RevenueCat
    revenuecat_secret_api_key: str = ""  # Server-only v1 API key
    revenuecat_entitlement_id: str = "Elory Pro"
    revenuecat_allow_sandbox: bool = False
    # Friends beta (EXPO_PUBLIC_TESTER_MODE builds skip RevenueCat): every signed-in
    # user gets premium features. Must be off before selling subscriptions.
    premium_open_beta: bool = False

    # External APIs
    openfoodfacts_api_base: str = "https://world.openfoodfacts.org/api/v3.6"
    openfoodfacts_contact_email: str = "hello@elory.app"
    openfoodfacts_user_agent: str = "Elory/1.0 (hello@elory.app)"
    usda_api_key: str = ""  # https://fdc.nal.usda.gov/api-guide.html (free)
    rapidapi_key: str = ""  # https://rapidapi.com — used for Sephora product API

    # Durable ingestion worker
    ingestion_worker_id: str = "elory-ingestion-worker"
    ingestion_poll_seconds: float = 1.0
    ingestion_job_lease_seconds: int = 300
    ingestion_job_max_attempts: int = 5
    image_max_download_bytes: int = 15_000_000
    image_processing_enabled: bool = True

    # Research agent
    anthropic_api_key: str = ""
    ncbi_api_key: str = ""  # Optional — raises PubMed rate limit from 3 to 10 req/s
    openai_api_key: str = ""  # For mechanism illustration generation (gpt-image-1.5)

    # CORS — in production set to your actual app origins, e.g.
    # ALLOWED_ORIGINS=["https://app.elory.com","https://elory.com"]
    allowed_origins: list[str] = ["*"]

    # App
    environment: str = "development"
    debug: bool = True

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def openfoodfacts_request_user_agent(self) -> str:
        """Always include a contact even when an older environment overrides UA."""
        user_agent = self.openfoodfacts_user_agent.strip() or "Elory/1.0"
        if self.openfoodfacts_contact_email and self.openfoodfacts_contact_email not in user_agent:
            return f"{user_agent} ({self.openfoodfacts_contact_email})"
        return user_agent


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
