import pytest

from app.models.ingredient import Ingredient
from app.models.product import Product, ProductIngredient
from app.models.tester import ProductSubmission, TesterEvent
from scripts.tester_report import gather_report, render_html

pytestmark = pytest.mark.anyio

D1, D2 = "device-one-111", "device-two-222"
UNKNOWN = "00000000000017"


async def _seed(session):
    researched = Ingredient(canonical_name="A", research_status="complete")
    pending = Ingredient(canonical_name="B", research_status="pending")
    product = Product(name="P", brand="Brand", barcode="3017620422003", category="food", extra_data={})
    session.add_all([researched, pending, product])
    await session.flush()
    session.add_all(
        [
            ProductIngredient(product_id=product.id, ingredient_id=researched.id, name="A", order_position=1),
            ProductIngredient(product_id=product.id, ingredient_id=pending.id, name="B", order_position=2),
            ProductIngredient(product_id=product.id, ingredient_id=None, name="Mystery Gum", order_position=3),
            # d1 scanned P's barcode while it was still being ingested (no product_id yet)
            TesterEvent(device_id=D1, event_type="scan", barcode="03017620422003", meta={"result": "queued"}),
            TesterEvent(device_id=D2, event_type="product_view", product_id=product.id, meta={"via": "search"}),
            TesterEvent(device_id=D1, event_type="scan", barcode=UNKNOWN, meta={"result": "queued"}),
            TesterEvent(device_id=D1, event_type="scan", barcode=UNKNOWN, meta={"result": "queued"}),
            TesterEvent(device_id=D2, event_type="search", query="rare serum", meta={"mode": "products", "results": 0}),
            TesterEvent(device_id=D1, event_type="feedback", product_id=product.id, meta={"message": "Score feels off"}),
            ProductSubmission(device_id=D1, barcode=UNKNOWN, name="Mystery", brand="Nobody", photo_paths=["x/1.jpg"]),
            ProductSubmission(device_id=D2, name="Rare Serum", photo_paths=[]),
        ]
    )
    await session.commit()
    return product


async def test_report_ranks_what_matters(db_session):
    await _seed(db_session)
    report = await gather_report(db_session, since=None)

    assert report["overview"] == {
        "testers": 2,
        "scans": 3,
        "scan_hits": 1,
        "searches": 1,
        "zero_result_searches": 1,
        "submissions": 2,
    }

    missed = report["missed"][0]
    assert (missed["barcode"], missed["testers"], missed["scans"]) == (UNKNOWN, 1, 2)
    assert missed["submissions"][0]["name"] == "Mystery"
    assert [s["name"] for s in report["unmatched_submissions"]] == ["Rare Serum"]

    top = report["products"][0]
    assert (top["name"], top["testers"], top["ingredients"], top["linked"], top["researched"]) == ("P", 2, 3, 2, 1)

    priority = {row["name"]: row for row in report["research_priority"]}
    assert priority["B"]["status"] == "unresearched" and priority["B"]["testers"] == 2
    assert priority["mystery gum"]["status"] == "unlinked"
    assert "A" not in priority  # already researched

    assert report["categories"] == [{"category": "food", "testers": 2, "products": 1}]
    assert report["zero_searches"] == [{"query": "rare serum", "testers": 1, "searches": 1}]
    assert report["feedback"][0]["message"] == "Score feels off"
    assert report["feedback"][0]["product"] == "P"
    assert {t["device"] for t in report["testers"]} == {D1[:8], D2[:8]}

    html = render_html(report, {"x/1.jpg": "https://example.test/signed.jpg"})
    assert "Research priority" in html
    assert "rare serum" in html
    assert "https://example.test/signed.jpg" in html


async def test_since_filters_old_activity(db_session):
    from datetime import datetime, timedelta, timezone

    await _seed(db_session)
    report = await gather_report(db_session, since=datetime.now(timezone.utc) + timedelta(minutes=1))
    assert report["overview"]["testers"] == 0
    assert report["missed"] == [] and report["products"] == []
