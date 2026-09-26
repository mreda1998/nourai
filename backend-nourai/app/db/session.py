"""Async database session configuration."""
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings


# Tests run each case on a fresh event loop; pooled asyncpg connections are
# bound to the loop that opened them, so the test environment skips pooling.
_pool_kwargs = {"poolclass": NullPool} if settings.environment == "test" else {"pool_pre_ping": True}

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    **_pool_kwargs,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides a database session."""
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()
