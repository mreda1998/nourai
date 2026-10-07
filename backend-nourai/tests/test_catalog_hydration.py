"""Inline hydration: a bounded wait, a circuit breaker, and the shared product job."""
import asyncio
import uuid
from types import SimpleNamespace

import pytest

from app.services.catalog.hydration import CatalogHydrator, CircuitBreaker
from app.services.ingestion.connectors.openfoodfacts import OpenFoodFactsError, OpenFoodFactsNotFound
from app.services.ingestion.product_job import ProductJobOutcome, run_product_job

pytestmark = pytest.mark.anyio

PRODUCT_ID = uuid.uuid4()


class FakeQueue:
    def __init__(self, status="queued", product_id=None):
        self.job = SimpleNamespace(id=uuid.uuid4(), status=status, product_id=product_id,
                                   payload={"barcode": "3017620422003", "gtin14": "03017620422003"})
        self.completed, self.reviewed, self.enqueued = [], [], []

    async def enqueue(self, session, *, job_type, idempotency_key, payload, priority=100):
        self.enqueued.append((job_type, idempotency_key))
        return self.job

    async def complete(self, job_id, *, result=None, product_id=None, source_record_id=None):
        self.completed.append((job_id, product_id))

    async def needs_review(self, job_id, *, result=None, product_id=None, source_record_id=None):
        self.reviewed.append((job_id, result))


class FakeDB:
    async def commit(self):
        return None


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def runner(outcome=None, *, delay=0.0, error=None):
    calls = []

    async def run(queue, pipeline, job, session_factory):
        calls.append(job.id)
        if delay:
            await asyncio.sleep(delay)
        if error:
            raise error
        return outcome or ProductJobOutcome("complete", PRODUCT_ID)

    run.calls = calls
    return run


def hydrator(queue, run, breaker=None, budget_s=0.05):
    return CatalogHydrator(queue, pipeline=None, session_factory=None,
                           breaker=breaker or CircuitBreaker(), budget_s=budget_s, run_job=run)


async def hydrate(h):
    return await h.hydrate(FakeDB(), digits="3017620422003", gtin14="03017620422003")


async def test_a_fast_source_hydrates_inline():
    queue = FakeQueue()
    result = await hydrate(hydrator(queue, runner()))
    assert (result.status, result.product_id) == ("hydrated", PRODUCT_ID)
    assert queue.enqueued == [("product_barcode", "barcode:off-v3.6:03017620422003")]


async def test_a_slow_source_falls_back_to_the_queue_and_counts_a_failure():
    breaker = CircuitBreaker(failures=1)
    result = await hydrate(hydrator(FakeQueue(), runner(delay=1.0), breaker=breaker))
    assert result.status == "queued"
    assert breaker.allow() is False


async def test_repeated_failures_open_the_breaker_until_the_cooldown_passes():
    clock = Clock()
    breaker = CircuitBreaker(failures=3, cooldown_s=60, clock=clock)
    failing = runner(error=OpenFoodFactsError("HTTP 429"))
    for _ in range(3):
        assert (await hydrate(hydrator(FakeQueue(), failing, breaker=breaker))).status == "queued"
    fast = runner()
    assert (await hydrate(hydrator(FakeQueue(), fast, breaker=breaker))).status == "queued"
    assert fast.calls == []  # the open breaker skipped the source entirely
    clock.now = 61
    assert (await hydrate(hydrator(FakeQueue(), fast, breaker=breaker))).status == "hydrated"


async def test_an_unknown_barcode_is_not_found_and_does_not_trip_the_breaker():
    breaker = CircuitBreaker(failures=1)
    result = await hydrate(hydrator(FakeQueue(), runner(ProductJobOutcome("not_found", None)), breaker=breaker))
    assert result.status == "not_found"
    assert breaker.allow() is True


async def test_an_already_completed_job_returns_its_product_without_running():
    run = runner()
    result = await hydrate(hydrator(FakeQueue(status="complete", product_id=PRODUCT_ID), run))
    assert (result.status, result.product_id) == ("hydrated", PRODUCT_ID)
    assert run.calls == []


async def test_a_job_already_sent_to_review_is_not_found():
    run = runner()
    result = await hydrate(hydrator(FakeQueue(status="needs_review"), run))
    assert result.status == "not_found"
    assert run.calls == []


# ─── run_product_job (shared with the worker) ─────────────────────────────────

class FakeSessions:
    def __call__(self):
        return self

    async def __aenter__(self):
        return SimpleNamespace(begin=lambda: self)

    async def __aexit__(self, *exc):
        return False


class FakePipeline:
    def __init__(self, result=None, error=None):
        self.result, self.error = result, error

    async def ingest_barcode(self, session, *, barcode, gtin14, job):
        if self.error:
            raise self.error
        return self.result


async def test_run_product_job_completes_a_product():
    queue = FakeQueue()
    result = SimpleNamespace(product_id=PRODUCT_ID, source_record_id=uuid.uuid4(), asset_ids=(),
                             revision_created=True, needs_review=False, message=None)
    outcome = await run_product_job(queue, FakePipeline(result), queue.job, FakeSessions())
    assert outcome == ProductJobOutcome("complete", PRODUCT_ID)
    assert queue.completed == [(queue.job.id, PRODUCT_ID)]


async def test_run_product_job_sends_unknown_barcodes_to_review():
    queue = FakeQueue()
    outcome = await run_product_job(queue, FakePipeline(error=OpenFoodFactsNotFound("nope")), queue.job, FakeSessions())
    assert outcome.status == "not_found"
    assert queue.reviewed[0][1]["reason"] == "not_found"
