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


def _product_as_loaded_from_postgres(**overrides):
    # products.category is a String(20) column: rows come back with a plain str, never a ProductCategory.
    fields = dict(id=uuid4(), name='Greek Yogurt', brand='Fage', image_url=None, health_score=72, category='food')
    return SimpleNamespace(**{**fields, **overrides})


def _stack_entry(product):
    return SimpleNamespace(
        id=uuid4(), product_id=product.id, logged_at=datetime.now(timezone.utc), time_of_day='morning',
        quantity=1.0, unit=None, notes=None, created_at=datetime.now(timezone.utc), product=product,
    )


class _FakeDB:
    """Answers the history endpoints' queries in order, the way an AsyncSession would."""

    def __init__(self, *results):
        self._results = list(results)

    async def execute(self, _stmt):
        value = self._results.pop(0)
        return SimpleNamespace(
            scalar_one=lambda: value,
            scalar_one_or_none=lambda: value,
            scalars=lambda: SimpleNamespace(all=lambda: value),
        )

    def add(self, obj):
        obj.id, obj.scanned_at = uuid4(), datetime.now(timezone.utc)

    async def commit(self):
        pass

    async def refresh(self, _obj):
        pass


@pytest.mark.anyio
async def test_stack_responses_carry_the_category_stored_on_the_product_row():
    user, product = SimpleNamespace(id=uuid4()), _product_as_loaded_from_postgres()
    entry = _stack_entry(product)
    service = SimpleNamespace(
        get_daily_stack=AsyncMock(return_value=[entry]), add_to_stack=AsyncMock(return_value=entry)
    )
    overrides = dict(app.dependency_overrides)
    app.dependency_overrides.update({get_current_user: lambda: user, get_stack_service: lambda: service})
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            response = await client.get('/api/v1/users/me/stack')
            assert response.status_code == 200
            assert response.json()[0]['product_category'] == 'food'
            response = await client.post('/api/v1/users/me/stack', json={'product_id': str(product.id)})
            assert response.status_code == 201
            assert response.json()['product_category'] == 'food'
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)


@pytest.mark.anyio
async def test_scan_history_responses_carry_the_category_stored_on_the_product_row():
    from app.db.session import get_db

    user, product = SimpleNamespace(id=uuid4()), _product_as_loaded_from_postgres()
    scanned = SimpleNamespace(id=uuid4(), product_id=product.id, product=product, scanned_at=datetime.now(timezone.utc))
    db = _FakeDB(1, [scanned], product)
    overrides = dict(app.dependency_overrides)
    app.dependency_overrides.update({get_current_user: lambda: user, get_db: lambda: db})
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            response = await client.get('/api/v1/users/me/history')
            assert response.status_code == 200
            assert response.json()['items'][0]['product_category'] == 'food'
            response = await client.post('/api/v1/users/me/history', json={'product_id': str(product.id)})
            assert response.status_code == 201
            assert response.json()['product_category'] == 'food'
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)
