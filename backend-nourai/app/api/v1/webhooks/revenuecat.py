"""RevenueCat webhook handler."""
import hashlib
import hmac
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Header, Request

from app.api.deps import get_subscription_service
from app.core.config import settings
from app.schemas.subscription import RevenueCatWebhookPayload
from app.services.subscription import SubscriptionService

router = APIRouter()
logger = logging.getLogger(__name__)


def verify_revenuecat_signature(
    payload: bytes,
    signature: str | None,
) -> bool:
    """
    Verify the RevenueCat webhook signature.

    RevenueCat signs webhooks using HMAC-SHA256.
    """
    if not settings.revenuecat_webhook_secret:
        # Skip verification in development if secret not configured
        if settings.is_development:
            logger.warning("RevenueCat webhook secret not configured, skipping verification")
            return True
        return False

    if not signature:
        return False

    expected_signature = hmac.new(
        settings.revenuecat_webhook_secret.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(signature, expected_signature)


@router.post("/revenuecat")
async def handle_revenuecat_webhook(
    request: Request,
    service: Annotated[SubscriptionService, Depends(get_subscription_service)],
    x_revenuecat_signature: str | None = Header(None, alias="X-RevenueCat-Signature"),
):
    """
    Handle RevenueCat subscription webhooks.

    Supported events:
    - INITIAL_PURCHASE: New subscription purchase
    - RENEWAL: Subscription renewed
    - CANCELLATION: User canceled subscription
    - EXPIRATION: Subscription expired
    - BILLING_ISSUE: Payment failed
    """
    # Get raw body for signature verification
    body = await request.body()

    # Verify signature
    if not verify_revenuecat_signature(body, x_revenuecat_signature):
        logger.warning("Invalid RevenueCat webhook signature")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse payload
    try:
        payload = RevenueCatWebhookPayload.model_validate_json(body)
    except Exception as e:
        logger.error(f"Failed to parse RevenueCat webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")

    logger.info(f"Received RevenueCat webhook: {payload.event_type}")

    # Process the event
    try:
        processed = await service.handle_webhook_event(payload)

        if not processed:
            logger.warning(f"Failed to process webhook event: {payload.event_type}")
            # Return 200 anyway to prevent retries for unprocessable events
            return {"status": "ignored", "reason": "user_not_found"}

        return {"status": "processed", "event_type": payload.event_type}

    except Exception as e:
        logger.error(f"Error processing RevenueCat webhook: {e}")
        raise HTTPException(status_code=500, detail="Internal error processing webhook")
