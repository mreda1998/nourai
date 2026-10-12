"""Reconcile access from RevenueCat's current state, never from event arrival order."""
from datetime import datetime, timezone
from urllib.parse import quote
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, Field, StrictBool

from app.core.config import settings
from app.models.subscription import Subscription, SubscriptionStatus, SubscriptionTier
from app.repositories.subscription import SubscriptionRepository
from app.repositories.user import UserRepository
from app.schemas.subscription import RevenueCatWebhookPayload


class Entitlement(BaseModel):
    expires_date: datetime | None
    grace_period_expires_date: datetime | None = None
    product_identifier: str
    purchase_date: datetime


class StoreSubscription(BaseModel):
    model_config = ConfigDict(coerce_numbers_to_str=True)
    is_sandbox: StrictBool
    store: str
    store_transaction_id: str | None = None
    unsubscribe_detected_at: datetime | None = None
    refunded_at: datetime | None = None


class Subscriber(BaseModel):
    entitlements: dict[str, Entitlement]
    subscriptions: dict[str, StoreSubscription] = Field(default_factory=dict)


class SubscriptionUnavailable(Exception):
    """The provider could not establish current entitlement state."""


def entitlement_values(subscriber: Subscriber, now: datetime) -> dict:
    """Only the configured entitlement and supported subscription products grant access."""
    free = dict(tier=SubscriptionTier.FREE, status=SubscriptionStatus.EXPIRED, expires_at=None)
    entitlement = subscriber.entitlements.get(settings.revenuecat_entitlement_id)
    if not entitlement:
        return free
    purchase = subscriber.subscriptions.get(entitlement.product_identifier)
    # Elory sells recurring subscriptions. Do not accidentally grant from an
    # unknown product, test purchase or unsupported non-subscription record.
    if not purchase or (purchase.is_sandbox and not settings.revenuecat_allow_sandbox) or purchase.refunded_at:
        return free
    expiry = entitlement.expires_date
    grace = entitlement.grace_period_expires_date
    for value in (expiry, grace, entitlement.purchase_date, purchase.unsubscribe_detected_at):
        if value is not None and value.tzinfo is None:
            raise ValueError('RevenueCat timestamps must include a timezone')
    if expiry is None:
        return free  # No lifetime products are sold by Elory.
    status = SubscriptionStatus.ACTIVE
    if expiry <= now:
        if grace and grace > now:
            status, expiry = SubscriptionStatus.GRACE_PERIOD, grace
        else:
            return free
    elif purchase.unsubscribe_detected_at:
        status = SubscriptionStatus.CANCELED
    return dict(
        tier=SubscriptionTier.PREMIUM, status=status, expires_at=expiry,
        started_at=entitlement.purchase_date, canceled_at=purchase.unsubscribe_detected_at,
        store=purchase.store, store_transaction_id=purchase.store_transaction_id,
    )


class SubscriptionService:
    def __init__(self, subscription_repository: SubscriptionRepository, user_repository: UserRepository):
        self._sub_repo = subscription_repository
        self._user_repo = user_repository

    async def get_subscription(self, user_id: UUID) -> Subscription | None:
        return await self._sub_repo.get_by_user_id(user_id)

    async def is_premium(self, user_id: UUID) -> bool:
        return await self._sub_repo.is_premium(user_id)

    async def _fetch_subscriber(self, app_user_id: str) -> Subscriber:
        if not settings.revenuecat_secret_api_key:
            raise SubscriptionUnavailable('Subscription verification is not configured')
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    f'https://api.revenuecat.com/v1/subscribers/{quote(app_user_id, safe="")}',
                    headers={'Authorization': f'Bearer {settings.revenuecat_secret_api_key}'},
                )
                response.raise_for_status()
                return Subscriber.model_validate(response.json()['subscriber'])
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
            raise SubscriptionUnavailable('Subscription verification is temporarily unavailable') from error

    async def reconcile(self, user_id: UUID, app_user_id: str) -> Subscription:
        await self._sub_repo.lock_user(user_id)
        subscriber = await self._fetch_subscriber(app_user_id)
        try:
            values = entitlement_values(subscriber, datetime.now(timezone.utc))
        except ValueError as error:
            raise SubscriptionUnavailable('Subscription response could not be verified') from error
        return await self._sub_repo.upsert(user_id=user_id, revenuecat_id=app_user_id, **values)

    async def handle_webhook_event(self, payload: RevenueCatWebhookPayload) -> bool:
        if payload.event_type == 'TEST':
            return True
        # Transfer events affect both the old and new owners. Sorted IDs give a
        # deterministic reconciliation order; duplicate deliveries just re-read.
        identifiers = set(payload.event.get('aliases') or [])
        identifiers.update(payload.event.get('transferred_from') or [])
        identifiers.update(payload.event.get('transferred_to') or [])
        if payload.app_user_id:
            identifiers.add(payload.app_user_id)
        processed = False
        for app_user_id in sorted(identifiers):
            user = await self._user_repo.get_by_supabase_id(app_user_id)
            if user:
                await self.reconcile(user.id, user.supabase_id)
                processed = True
        return processed
