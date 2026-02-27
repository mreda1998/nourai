"""Stack service for managing user supplement logs."""
from datetime import datetime
from uuid import UUID

from app.models.user import UserStackEntry
from app.repositories.user import UserRepository
from app.repositories.product import ProductRepository
from app.schemas.user import StackEntryCreate


class StackService:
    """Service for user stack (supplement log) operations."""

    def __init__(
        self,
        user_repository: UserRepository,
        product_repository: ProductRepository,
    ):
        self._user_repo = user_repository
        self._product_repo = product_repository

    async def add_to_stack(
        self,
        user_id: UUID,
        entry_data: StackEntryCreate,
    ) -> UserStackEntry:
        """Add a product to user's stack."""
        # Verify product exists
        product = await self._product_repo.get_by_id(entry_data.product_id)
        if not product:
            raise ValueError(f"Product {entry_data.product_id} not found")

        logged_at = entry_data.logged_at or datetime.utcnow()

        return await self._user_repo.add_stack_entry(
            user_id=user_id,
            product_id=entry_data.product_id,
            logged_at=logged_at,
            time_of_day=entry_data.time_of_day,
            quantity=entry_data.quantity,
            unit=entry_data.unit,
            notes=entry_data.notes,
        )

    async def remove_from_stack(self, user_id: UUID, entry_id: UUID) -> bool:
        """Remove an entry from user's stack."""
        return await self._user_repo.delete_stack_entry(entry_id, user_id)

    async def get_stack(
        self,
        user_id: UUID,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[UserStackEntry]:
        """Get user's stack entries with optional date filtering."""
        return await self._user_repo.get_stack_entries(
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            offset=offset,
        )

    async def get_daily_stack(self, user_id: UUID, date: datetime) -> list[UserStackEntry]:
        """Get stack entries for a specific day."""
        return await self._user_repo.get_daily_stack(user_id, date)

    async def get_stack_entry(self, user_id: UUID, entry_id: UUID) -> UserStackEntry | None:
        """Get a specific stack entry."""
        return await self._user_repo.get_stack_entry(entry_id, user_id)
