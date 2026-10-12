from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.api.deps import get_stack_service, get_subscription_service
from app.core.security import get_current_user
from app.models.subscription import Subscription, SubscriptionStatus, SubscriptionTier
from datetime import datetime, timedelta, timezone


@pytest.fixture
def anyio_backend():
    return 'asyncio'


@pytest.mark.anyio
async def test_all_entries_scope_preserves_history_and_passes_pagination():
    user = SimpleNamespace(id=uuid4())
    service = SimpleNamespace(get_stack=AsyncMock(return_value=[]), get_daily_stack=AsyncMock(return_value=[]))
    overrides = dict(app.dependency_overrides)
    app.dependency_overrides.update({get_current_user: lambda: user, get_stack_service: lambda: service})
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            response = await client.get('/api/v1/users/me/stack?scope=all&limit=50&offset=100')
            assert response.status_code == 200 and response.json() == []
            service.get_stack.assert_awaited_once_with(user.id, limit=50, offset=100)
            service.get_daily_stack.assert_not_awaited()
            response = await client.get('/api/v1/users/me/stack?scope=all&date=2026-09-29')
            assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)


@pytest.mark.anyio
async def test_delete_is_scoped_to_authenticated_owner_and_entry_id():
    user, entry_id = SimpleNamespace(id=uuid4()), uuid4()
    service = SimpleNamespace(remove_from_stack=AsyncMock(return_value=False))
    overrides = dict(app.dependency_overrides)
    app.dependency_overrides.update({get_current_user: lambda: user, get_stack_service: lambda: service})
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            response = await client.delete(f'/api/v1/users/me/stack/{entry_id}')
            assert response.status_code == 404
            service.remove_from_stack.assert_awaited_once_with(user.id, entry_id)
            service.remove_from_stack.return_value = True
            response = await client.delete(f'/api/v1/users/me/stack/{entry_id}')
            assert response.status_code == 204
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)


@pytest.mark.anyio
async def test_verification_cannot_grant_a_client_requested_entitlement_or_target_another_user():
    user = SimpleNamespace(id=uuid4(), supabase_id='authenticated-owner')
    subscription = Subscription(tier=SubscriptionTier.PREMIUM, status=SubscriptionStatus.ACTIVE, expires_at=datetime.now(timezone.utc) + timedelta(days=1))
    service = SimpleNamespace(reconcile=AsyncMock(return_value=subscription))
    overrides = dict(app.dependency_overrides)
    app.dependency_overrides.update({get_current_user: lambda: user, get_subscription_service: lambda: service})
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            response = await client.post('/api/v1/users/me/subscription/verify', json={'app_user_id': 'someone-else', 'is_premium': True})
            assert response.status_code == 200
            service.reconcile.assert_awaited_once_with(user.id, user.supabase_id)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)
