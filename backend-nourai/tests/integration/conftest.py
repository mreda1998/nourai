"""
Integration tests run against a real, disposable, fully migrated Postgres.

They are skipped unless TEST_DATABASE_URL is set *and* equals DATABASE_URL —
a deliberate double opt-in, because every test truncates tables.

    docker run -d --rm --name elory-test-pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16-alpine
    export DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:55432/postgres
    export TEST_DATABASE_URL=$DATABASE_URL ENVIRONMENT=test
    alembic upgrade head && pytest tests/integration
"""
import os

import pytest
from sqlalchemy import text

from app.core.config import settings
from app.db.session import async_session_factory

TEST_URL = os.environ.get("TEST_DATABASE_URL")
if not TEST_URL or TEST_URL != settings.database_url:
    pytest.skip(
        "integration tests need TEST_DATABASE_URL == DATABASE_URL (a disposable DB)",
        allow_module_level=True,
    )

_TABLES = (
    "regulatory_rules, rule_checks, ingredient_substances, regulated_substance_aliases, regulated_substances, "
    "catalog_entries, tester_events, product_submissions, ingestion_jobs, product_ingredients, "
    "product_identifiers, products, ingredients"
)


@pytest.fixture(autouse=True)
async def _clean_tables():
    async with async_session_factory() as session:
        await session.execute(text(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))
        await session.commit()
    yield


@pytest.fixture
async def db_session():
    async with async_session_factory() as session:
        yield session


@pytest.fixture(autouse=True)
def _offline_hydration():
    """Integration tests never call Open Food Facts: jobs are enqueued for real, never run inline."""
    from app.api.v1.products import get_catalog_hydrator
    from app.main import app
    from app.services.catalog.hydration import CatalogHydrator, CircuitBreaker
    from app.services.ingestion.queue import IngestionQueue

    async def never_finishes(queue, pipeline, job, session_factory):
        raise TimeoutError

    def offline():
        return CatalogHydrator(
            IngestionQueue(async_session_factory), pipeline=None, session_factory=async_session_factory,
            breaker=CircuitBreaker(), budget_s=0.01, run_job=never_finishes,
        )

    app.dependency_overrides[get_catalog_hydrator] = offline
    yield
    app.dependency_overrides.pop(get_catalog_hydrator, None)
