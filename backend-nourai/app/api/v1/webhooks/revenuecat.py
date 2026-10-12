"""RevenueCat webhook: configured Authorization header and authoritative reconciliation."""
import hmac
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Header

from app.api.deps import get_subscription_service
from app.core.config import settings
from app.schemas.subscription import RevenueCatWebhookPayload
from app.services.subscription import SubscriptionService, SubscriptionUnavailable

router = APIRouter()
logger = logging.getLogger(__name__)


def verify_revenuecat_authorization(authorization: str | None) -> bool:
    expected = settings.revenuecat_webhook_secret
    return bool(expected and authorization and hmac.compare_digest(authorization.encode(), expected.encode()))


def require_webhook_authorization(authorization: str | None = Header(None)) -> None:
    if not verify_revenuecat_authorization(authorization):
        raise HTTPException(status_code=401, detail='Invalid webhook authorization')


@router.post('/revenuecat', dependencies=[Depends(require_webhook_authorization)])
async def handle_revenuecat_webhook(
    payload: RevenueCatWebhookPayload,
    service: Annotated[SubscriptionService, Depends(get_subscription_service)],
):
    try:
        processed = await service.handle_webhook_event(payload)
    except SubscriptionUnavailable:
        # Non-2xx asks RevenueCat to retry; never acknowledge an unapplied update.
        raise HTTPException(status_code=503, detail='Subscription verification unavailable')
    if not processed:
        raise HTTPException(status_code=503, detail='Subscriber account not yet available')
    return {'status': 'processed'}
