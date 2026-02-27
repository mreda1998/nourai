"""Shared API dependencies."""
from typing import Annotated

from fastapi import Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user, get_current_user_optional
from app.db.session import get_db
from app.models.user import UserProfile
from app.repositories.personalization import PersonalizationRepository
from app.repositories.product import ProductRepository
from app.repositories.subscription import SubscriptionRepository
from app.repositories.user import UserRepository
from app.services.personalization import PersonalizationService
from app.services.product import ProductService
from app.services.stack import StackService
from app.services.subscription import SubscriptionService


# Type aliases for common dependencies
DBSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[UserProfile, Depends(get_current_user)]
OptionalUser = Annotated[UserProfile | None, Depends(get_current_user_optional)]


class PaginationParams(BaseModel):
    """Pagination parameters."""

    limit: int = 20
    offset: int = 0


def get_pagination(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> PaginationParams:
    """Get pagination parameters from query."""
    return PaginationParams(limit=limit, offset=offset)


# Repository dependencies

def get_product_repository(db: DBSession) -> ProductRepository:
    """Get ProductRepository instance."""
    return ProductRepository(db)


def get_user_repository(db: DBSession) -> UserRepository:
    """Get UserRepository instance."""
    return UserRepository(db)


def get_subscription_repository(db: DBSession) -> SubscriptionRepository:
    """Get SubscriptionRepository instance."""
    return SubscriptionRepository(db)


# Service dependencies

def get_product_service(
    product_repo: Annotated[ProductRepository, Depends(get_product_repository)],
) -> ProductService:
    """Get ProductService instance."""
    return ProductService(product_repo)


def get_personalization_repository(db: DBSession) -> PersonalizationRepository:
    """Get PersonalizationRepository instance."""
    return PersonalizationRepository(db)


def get_personalization_service(
    personalization_repo: Annotated[PersonalizationRepository, Depends(get_personalization_repository)],
) -> PersonalizationService:
    """Get PersonalizationService instance."""
    return PersonalizationService(personalization_repo)


def get_stack_service(
    user_repo: Annotated[UserRepository, Depends(get_user_repository)],
    product_repo: Annotated[ProductRepository, Depends(get_product_repository)],
) -> StackService:
    """Get StackService instance."""
    return StackService(user_repo, product_repo)


def get_subscription_service(
    sub_repo: Annotated[SubscriptionRepository, Depends(get_subscription_repository)],
    user_repo: Annotated[UserRepository, Depends(get_user_repository)],
) -> SubscriptionService:
    """Get SubscriptionService instance."""
    return SubscriptionService(sub_repo, user_repo)
