"""Base repository with common CRUD operations using SQLAlchemy 2.0."""
from typing import Generic, TypeVar
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base


T = TypeVar("T", bound=Base)


class BaseRepository(Generic[T]):
    """Generic base repository with common CRUD operations."""

    model: type[T]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, **kwargs) -> T:
        """Create a new entity."""
        instance = self.model(**kwargs)
        self.db.add(instance)
        await self.db.commit()
        await self.db.refresh(instance)
        return instance

    async def get_by_id(self, id: UUID) -> T | None:
        """Get entity by ID."""
        result = await self.db.execute(select(self.model).where(self.model.id == id))
        return result.scalar_one_or_none()

    async def get_all(self, limit: int = 100, offset: int = 0) -> list[T]:
        """Get all entities with pagination."""
        result = await self.db.execute(select(self.model).limit(limit).offset(offset))
        return list(result.scalars().all())

    async def find_by(self, **filters) -> list[T]:
        """Find entities matching filters."""
        query = select(self.model)
        for key, value in filters.items():
            if hasattr(self.model, key):
                query = query.where(getattr(self.model, key) == value)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_one_by(self, **filters) -> T | None:
        """Find a single entity matching filters."""
        query = select(self.model)
        for key, value in filters.items():
            if hasattr(self.model, key):
                query = query.where(getattr(self.model, key) == value)
        result = await self.db.execute(query.limit(1))
        return result.scalar_one_or_none()

    async def exists(self, **filters) -> bool:
        """Check if entity exists."""
        query = select(func.count()).select_from(self.model)
        for key, value in filters.items():
            if hasattr(self.model, key):
                query = query.where(getattr(self.model, key) == value)
        result = await self.db.execute(query)
        return result.scalar_one() > 0

    async def count(self, **filters) -> int:
        """Count entities matching filters."""
        query = select(func.count()).select_from(self.model)
        for key, value in filters.items():
            if hasattr(self.model, key):
                query = query.where(getattr(self.model, key) == value)
        result = await self.db.execute(query)
        return result.scalar_one()

    async def update(self, id: UUID, **kwargs) -> T | None:
        """Update an entity by ID."""
        instance = await self.get_by_id(id)
        if not instance:
            return None
        for key, value in kwargs.items():
            if hasattr(instance, key) and value is not None:
                setattr(instance, key, value)
        await self.db.commit()
        await self.db.refresh(instance)
        return instance

    async def delete(self, id: UUID) -> bool:
        """Delete an entity by ID."""
        result = await self.db.execute(delete(self.model).where(self.model.id == id))
        await self.db.commit()
        return result.rowcount > 0

    async def delete_many(self, **filters) -> int:
        """Delete entities matching filters."""
        query = delete(self.model)
        for key, value in filters.items():
            if hasattr(self.model, key):
                query = query.where(getattr(self.model, key) == value)
        result = await self.db.execute(query)
        await self.db.commit()
        return result.rowcount
