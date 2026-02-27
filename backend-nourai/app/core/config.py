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

    # RevenueCat
    revenuecat_webhook_secret: str = ""

    # External APIs
    openfoodfacts_user_agent: str = "NourAI/1.0"

    # Research agent
    anthropic_api_key: str = ""
    ncbi_api_key: str = ""  # Optional — raises PubMed rate limit from 3 to 10 req/s

    # CORS — in production set to your actual app origins, e.g.
    # ALLOWED_ORIGINS=["https://app.nourai.com","https://nourai.com"]
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


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
