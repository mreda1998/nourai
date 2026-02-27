"""User repository using SQLAlchemy 2.0."""
from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.orm import selectinload

from app.models.user import UserProfile, UserStackEntry
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[UserProfile]):
    """Repository for UserProfile entity."""

    model = UserProfile

    async def get_by_supabase_id(self, supabase_id: str) -> UserProfile | None:
        """Find user by Supabase ID."""
        result = await self.db.execute(
            select(UserProfile).where(UserProfile.supabase_id == supabase_id)
        )
        return result.scalar_one_or_none()

    async def get_or_create(self, supabase_id: str, email: str | None = None) -> UserProfile:
        """Get existing user or create new one."""
        user = await self.get_by_supabase_id(supabase_id)
        if user:
            return user

        user = UserProfile(supabase_id=supabase_id, email=email)
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def get_with_subscription(self, id: UUID) -> UserProfile | None:
        """Get user with subscription eagerly loaded."""
        result = await self.db.execute(
            select(UserProfile)
            .where(UserProfile.id == id)
            .options(selectinload(UserProfile.subscription))
        )
        return result.scalar_one_or_none()

    async def update_last_active(self, id: UUID) -> None:
        """Update user's last active timestamp."""
        user = await self.get_by_id(id)
        if user:
            user.last_active_at = datetime.utcnow()
            await self.db.commit()

    # Stack entry methods

    async def get_stack_entries(
        self,
        user_id: UUID,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[UserStackEntry]:
        """Get user's stack entries with optional date filtering."""
        query = (
            select(UserStackEntry)
            .where(UserStackEntry.user_id == user_id)
            .order_by(UserStackEntry.logged_at.desc())
        )

        if start_date:
            query = query.where(UserStackEntry.logged_at >= start_date)
        if end_date:
            query = query.where(UserStackEntry.logged_at <= end_date)

        result = await self.db.execute(query.limit(limit).offset(offset))
        return list(result.scalars().all())

    async def get_daily_stack(self, user_id: UUID, date: datetime) -> list[UserStackEntry]:
        """Get stack entries for a specific day."""
        start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = date.replace(hour=23, minute=59, second=59, microsecond=999999)

        result = await self.db.execute(
            select(UserStackEntry)
            .where(
                and_(
                    UserStackEntry.user_id == user_id,
                    UserStackEntry.logged_at >= start_of_day,
                    UserStackEntry.logged_at <= end_of_day,
                )
            )
            .order_by(UserStackEntry.logged_at)
        )
        return list(result.scalars().all())

    async def add_stack_entry(
        self,
        user_id: UUID,
        product_id: UUID,
        logged_at: datetime,
        **kwargs,
    ) -> UserStackEntry:
        """Add a new stack entry."""
        entry = UserStackEntry(
            user_id=user_id,
            product_id=product_id,
            logged_at=logged_at,
            **kwargs,
        )
        self.db.add(entry)
        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    async def get_stack_entry(self, entry_id: UUID, user_id: UUID) -> UserStackEntry | None:
        """Get a specific stack entry for a user."""
        result = await self.db.execute(
            select(UserStackEntry).where(
                and_(
                    UserStackEntry.id == entry_id,
                    UserStackEntry.user_id == user_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def delete_stack_entry(self, entry_id: UUID, user_id: UUID) -> bool:
        """Delete a stack entry (only if it belongs to the user)."""
        entry = await self.get_stack_entry(entry_id, user_id)
        if not entry:
            return False

        await self.db.delete(entry)
        await self.db.commit()
        return True
