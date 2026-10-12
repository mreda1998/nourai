from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.deps import require_premium
from app.api.v1.webhooks.revenuecat import verify_revenuecat_authorization
from app.core.config import settings
from app.models.subscription import Subscription, SubscriptionStatus, SubscriptionTier
from app.schemas.subscription import RevenueCatWebhookPayload
from app.services.subscription import Subscriber, SubscriptionService, SubscriptionUnavailable, entitlement_values

@pytest.fixture
def anyio_backend():
    return 'asyncio'


NOW = datetime.now(timezone.utc)


def subscriber(expiry=None, **purchase_changes):
    return Subscriber.model_validate({'entitlements': {'Elory Pro': {
        'expires_date': (expiry or NOW + timedelta(days=7)).isoformat(),
        'product_identifier': 'annual', 'purchase_date': (NOW - timedelta(days=7)).isoformat(),
    }}, 'subscriptions': {'annual': {'is_sandbox': False, 'store': 'app_store', **purchase_changes}}})


@pytest.mark.parametrize('status', [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELED, SubscriptionStatus.GRACE_PERIOD])
def test_access_expires_without_an_expiration_webhook(status):
    subscription = Subscription(tier=SubscriptionTier.PREMIUM, status=status, expires_at=NOW - timedelta(seconds=1))
    assert not subscription.is_premium
    subscription.expires_at = NOW + timedelta(days=1)
    assert subscription.is_premium


def test_cancel_does_not_revoke_paid_through_access():
    values = entitlement_values(subscriber(unsubscribe_detected_at=NOW.isoformat()), NOW)
    assert values['status'] == SubscriptionStatus.CANCELED
    assert Subscription(**values).is_premium


def test_grace_period_has_a_real_deadline():
    data = subscriber(NOW - timedelta(days=1))
    data.entitlements['Elory Pro'].grace_period_expires_date = NOW + timedelta(days=2)
    values = entitlement_values(data, NOW)
    assert values['status'] == SubscriptionStatus.GRACE_PERIOD
    assert values['expires_at'] == NOW + timedelta(days=2)
    assert entitlement_values(data, NOW + timedelta(days=3))['tier'] == SubscriptionTier.FREE


@pytest.mark.parametrize('change', [{'refunded_at': NOW.isoformat()}, {'is_sandbox': True}])
def test_refunds_and_sandbox_do_not_grant_production_access(monkeypatch, change):
    monkeypatch.setattr(settings, 'revenuecat_allow_sandbox', False)
    assert entitlement_values(subscriber(**change), NOW)['tier'] == SubscriptionTier.FREE


def test_test_backend_can_explicitly_accept_sandbox(monkeypatch):
    monkeypatch.setattr(settings, 'revenuecat_allow_sandbox', True)
    assert entitlement_values(subscriber(is_sandbox=True), NOW)['tier'] == SubscriptionTier.PREMIUM


def test_unrelated_entitlement_and_missing_purchase_fail_closed():
    data = subscriber()
    data.entitlements['Other'] = data.entitlements.pop('Elory Pro')
    assert entitlement_values(data, NOW)['tier'] == SubscriptionTier.FREE
    data = subscriber()
    data.subscriptions.clear()
    assert entitlement_values(data, NOW)['tier'] == SubscriptionTier.FREE


def test_malformed_expiration_does_not_grant_access():
    data = subscriber()
    data.entitlements['Elory Pro'].expires_date = NOW.replace(tzinfo=None)
    with pytest.raises(ValueError):
        entitlement_values(data, NOW)
    data.entitlements['Elory Pro'].expires_date = None
    assert entitlement_values(data, NOW)['tier'] == SubscriptionTier.FREE


def test_webhook_authentication_never_bypasses_missing_configuration(monkeypatch):
    monkeypatch.setattr(settings, 'environment', 'development')
    monkeypatch.setattr(settings, 'revenuecat_webhook_secret', '')
    assert not verify_revenuecat_authorization(None)
    monkeypatch.setattr(settings, 'revenuecat_webhook_secret', 'Bearer test-secret')
    assert not verify_revenuecat_authorization('wrong')
    assert verify_revenuecat_authorization('Bearer test-secret')


@pytest.mark.anyio
async def test_duplicate_or_late_events_reconcile_current_state_not_event_payload():
    user = SimpleNamespace(id=uuid4(), supabase_id='owner')
    users, repo = SimpleNamespace(get_by_supabase_id=AsyncMock(return_value=user)), SimpleNamespace(lock_user=AsyncMock(), upsert=AsyncMock())
    service = SubscriptionService(repo, users)
    service._fetch_subscriber = AsyncMock(return_value=subscriber())
    for event_type in ['RENEWAL', 'EXPIRATION', 'EXPIRATION']:
        payload = RevenueCatWebhookPayload(api_version='1.0', event={'type': event_type, 'app_user_id': 'owner'})
        assert await service.handle_webhook_event(payload)
        assert repo.upsert.call_args.kwargs['status'] == SubscriptionStatus.ACTIVE
    assert repo.lock_user.await_count == 3


@pytest.mark.anyio
async def test_transfer_reconciles_both_accounts():
    users = SimpleNamespace(get_by_supabase_id=AsyncMock(side_effect=lambda value: SimpleNamespace(id=value, supabase_id=value)))
    service = SubscriptionService(SimpleNamespace(), users)
    service.reconcile = AsyncMock()
    payload = RevenueCatWebhookPayload(api_version='1.0', event={'type': 'TRANSFER', 'transferred_from': ['old'], 'transferred_to': ['new']})
    assert await service.handle_webhook_event(payload)
    assert {call.args for call in service.reconcile.call_args_list} == {('old', 'old'), ('new', 'new')}


@pytest.mark.anyio
async def test_provider_outage_does_not_overwrite_existing_entitlement():
    repo = SimpleNamespace(lock_user=AsyncMock(), upsert=AsyncMock())
    service = SubscriptionService(repo, SimpleNamespace())
    service._fetch_subscriber = AsyncMock(side_effect=SubscriptionUnavailable())
    with pytest.raises(SubscriptionUnavailable):
        await service.reconcile(uuid4(), 'owner')
    repo.upsert.assert_not_awaited()


@pytest.mark.anyio
async def test_premium_dependency_denies_free_and_accepts_paid():
    user = SimpleNamespace(id=uuid4())
    service = SimpleNamespace(is_premium=AsyncMock(return_value=False))
    with pytest.raises(HTTPException) as error:
        await require_premium(user, service)
    assert error.value.status_code == 403
    service.is_premium.return_value = True
    assert await require_premium(user, service) is user


@pytest.mark.anyio
async def test_open_beta_grants_premium_to_any_signed_in_user(monkeypatch):
    """Tester builds skip RevenueCat; during the friends beta the server lets them in."""
    user = SimpleNamespace(id=uuid4())
    service = SimpleNamespace(is_premium=AsyncMock(return_value=False))
    monkeypatch.setattr(settings, 'premium_open_beta', True)
    assert await require_premium(user, service) is user
    service.is_premium.assert_not_awaited()


def test_legacy_missing_expiry_is_not_unlimited_access():
    assert not Subscription(tier=SubscriptionTier.PREMIUM, status=SubscriptionStatus.ACTIVE, expires_at=None).is_premium


@pytest.mark.anyio
async def test_http_premium_routes_enforce_access_before_running_handlers():
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.core.security import get_current_user
    from app.api.deps import get_subscription_service
    from app.db.session import get_db

    user = SimpleNamespace(id=uuid4())
    async def database():
        yield AsyncMock()
    overrides = dict(app.dependency_overrides)
    app.dependency_overrides.update({
        get_current_user: lambda: user,
        get_subscription_service: lambda: SimpleNamespace(is_premium=AsyncMock(return_value=False)),
        get_db: database,
    })
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            for path in ['/api/v1/atelier/circadian', '/api/v1/atelier/conflict-map', '/api/v1/peptides']:
                response = await client.get(path)
                assert response.status_code == 403, (path, response.text)
            response = await client.post('/api/v1/chat/message', json={})
            assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)


@pytest.mark.anyio
async def test_webhook_retries_on_provider_failure_and_rejects_bad_authorization(monkeypatch):
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.api.deps import get_subscription_service
    monkeypatch.setattr(settings, 'revenuecat_webhook_secret', 'Bearer expected')
    service = SimpleNamespace(handle_webhook_event=AsyncMock(side_effect=SubscriptionUnavailable()))
    overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_subscription_service] = lambda: service
    payload = {'api_version': '1.0', 'event': {'type': 'RENEWAL', 'app_user_id': 'owner'}}
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            response = await client.post('/api/v1/webhooks/revenuecat', json=payload)
            assert response.status_code == 401
            service.handle_webhook_event.assert_not_awaited()
            response = await client.post('/api/v1/webhooks/revenuecat', json=payload, headers={'Authorization': 'Bearer expected'})
            assert response.status_code == 503
            response = await client.post('/api/v1/webhooks/revenuecat', json={'api_version': '1.0', 'event': {'type': 'TRANSFER', 'aliases': 'bad'}}, headers={'Authorization': 'Bearer expected'})
            assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)
