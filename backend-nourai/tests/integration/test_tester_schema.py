import pytest
from sqlalchemy import select

from app.models.tester import ProductSubmission, TesterEvent

pytestmark = pytest.mark.anyio


async def test_tester_tables_round_trip(db_session):
    db_session.add(
        TesterEvent(device_id="dev-12345678", event_type="search", query="cerave", meta={"results": 0})
    )
    db_session.add(ProductSubmission(device_id="dev-12345678", name="Cleanser", photo_paths=["a/1.jpg"]))
    await db_session.commit()

    event = (await db_session.execute(select(TesterEvent))).scalar_one()
    submission = (await db_session.execute(select(ProductSubmission))).scalar_one()

    assert event.meta == {"results": 0}
    assert event.created_at is not None
    assert submission.status == "new"
    assert submission.photo_paths == ["a/1.jpg"]
