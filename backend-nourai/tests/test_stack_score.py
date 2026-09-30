from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.services.stack_score import daily_score, health_domain, score_qualifier


def _no_ingredients():
    return patch("app.api.v1.scores.load_product_ingredients", new=AsyncMock(return_value=[]))


@pytest.mark.anyio
async def test_daily_score_for_empty_stack(client):
    with _no_ingredients():
        response = await client.post("/api/v1/scores/daily", json={"product_ids": []})
    assert response.status_code == 200
    body = response.json()
    assert body["overall"] == 0
    assert len(body["categories"]) == 5


@pytest.mark.anyio
async def test_domain_score_for_known_domain(client):
    with _no_ingredients():
        response = await client.post("/api/v1/scores/domain/skin_appearance", json={"product_ids": [str(uuid4())]})
    assert response.status_code == 200
    assert response.json()["label"] == "Skin & Appearance"


@pytest.mark.anyio
async def test_unknown_domain_is_404(client):
    with _no_ingredients():
        response = await client.post("/api/v1/scores/domain/not_a_domain", json={"product_ids": []})
    assert response.status_code == 404


@pytest.mark.anyio
async def test_too_many_ids_is_422(client):
    ids = [str(uuid4()) for _ in range(51)]
    response = await client.post("/api/v1/scores/daily", json={"product_ids": ids})
    assert response.status_code == 422


def test_score_qualifier_bands():
    assert [score_qualifier(v) for v in (85, 70, 55, 10)] == ["High", "Good", "Moderate", "Low"]


def test_service_handles_empty_input():
    assert daily_score([]).overall == 0
    assert health_domain("sleep_recovery", []).score == 0
    assert health_domain("nope", []) is None


def test_unscored_ingredients_mean_no_score_not_a_neutral_50():
    """Products whose ingredients have no research yet must not look 'Moderate'."""
    from types import SimpleNamespace

    unscored = [SimpleNamespace(ingredient=None, name="Mystery Gum")]
    result = daily_score(unscored)
    assert result.overall == 0
    assert all(category.value == 0 for category in result.categories)
