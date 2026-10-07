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
