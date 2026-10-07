"""The streaming import loop, with an in-memory sink — no database, no network."""
import gzip

import httpx
import pytest

from app.services.catalog.importer import ImportAborted, run_import
from app.services.catalog.records import CatalogRow, aiter_tsv
from app.services.catalog.stream import stream_gzip_lines

pytestmark = pytest.mark.anyio


def catalog_row(n: int, additives: tuple[str, ...] = ()) -> CatalogRow:
    return CatalogRow(
        external_id=str(n), gtin14=str(n).zfill(14), name=f"Product {n}", brand=None, category="food",
        countries=(), image_url=None, popularity=0, completeness=None, source_updated_at=None,
        search_text=f"product {n}", content_hash=str(n), additives=additives,
    )


def rows(count: int, *, junk: bool = False) -> list[dict[str, str]]:
    return [{"n": str(i), "junk": "1" if junk else ""} for i in range(1, count + 1)]


def parse(row: dict[str, str]) -> CatalogRow | None:
    return None if row["junk"] else catalog_row(int(row["n"]), additives=("en:e330",))


class FakeSink:
    def __init__(self, fail_size_check_on: int | None = None):
        self.batches: list[list[CatalogRow]] = []
        self.checkpoints: list[int] = []
        self.size_checks = 0
        self.fail_size_check_on = fail_size_check_on

    async def write_batch(self, batch):
        self.batches.append(list(batch))
        return len(batch), 0

    async def checkpoint(self, line, stats):
        self.checkpoints.append(line)

    async def check_size(self):
        self.size_checks += 1
        if self.fail_size_check_on and self.size_checks >= self.fail_size_check_on:
            raise ImportAborted("database would exceed its size budget")


async def test_rows_are_written_in_batches_with_a_final_partial_batch():
    sink = FakeSink()
    stats = await run_import(rows(7), parse=parse, sink=sink, batch_size=3, sanity_after=1)
    assert [len(b) for b in sink.batches] == [3, 3, 1]
    assert (stats.read, stats.parsed, stats.inserted) == (7, 7, 7)


async def test_checkpoint_follows_every_batch_with_the_last_line_read():
    sink = FakeSink()
    await run_import(rows(7), parse=parse, sink=sink, batch_size=3, sanity_after=1)
    assert sink.checkpoints == [3, 6, 7]


async def test_resume_skips_rows_without_parsing_them():
    seen = []

    def counting_parse(row):
        seen.append(row["n"])
        return parse(row)

    sink = FakeSink()
    stats = await run_import(rows(6), parse=counting_parse, sink=sink, batch_size=10, sanity_after=1, resume_from=3)
    assert seen == ["4", "5", "6"]
    assert [r.external_id for r in sink.batches[0]] == ["4", "5", "6"]
    assert sink.checkpoints == [6]
    assert stats.read == 3


async def test_limit_stops_after_that_many_rows():
    sink = FakeSink()
    stats = await run_import(rows(20), parse=parse, sink=sink, batch_size=100, sanity_after=1, limit=5)
    assert stats.read == 5
    assert sum(len(b) for b in sink.batches) == 5


async def test_a_dump_that_mostly_fails_to_parse_aborts_before_any_write():
    sink = FakeSink()
    with pytest.raises(ImportAborted):
        await run_import(rows(10, junk=True), parse=parse, sink=sink, batch_size=5, sanity_after=10)
    assert sink.batches == []


async def test_a_short_dump_is_still_checked_for_parse_failures():
    sink = FakeSink()
    with pytest.raises(ImportAborted):
        await run_import(rows(4, junk=True), parse=parse, sink=sink, batch_size=5, sanity_after=50)
    assert sink.batches == []


async def test_size_is_checked_before_the_first_write_and_every_few_batches():
    sink = FakeSink()
    await run_import(rows(12), parse=parse, sink=sink, batch_size=2, sanity_after=1, size_check_every=2)
    assert len(sink.batches) == 6
    assert sink.size_checks == 4  # before batch 1, then after batches 2, 4 and 6


async def test_a_failed_size_check_stops_the_run():
    sink = FakeSink(fail_size_check_on=2)
    with pytest.raises(ImportAborted):
        await run_import(rows(12), parse=parse, sink=sink, batch_size=2, sanity_after=1, size_check_every=2)
    assert len(sink.batches) == 2


async def test_additives_are_tallied():
    stats = await run_import(rows(4), parse=parse, sink=FakeSink(), batch_size=10, sanity_after=1)
    assert stats.additives["en:e330"] == 4


async def test_async_row_sources_are_accepted():
    async def source():
        for row in rows(3):
            yield row

    sink = FakeSink()
    stats = await run_import(source(), parse=parse, sink=sink, batch_size=10, sanity_after=1)
    assert stats.parsed == 3


class Chunked(httpx.AsyncByteStream):
    def __init__(self, data: bytes, size: int):
        self.data, self.size = data, size

    async def __aiter__(self):
        for i in range(0, len(self.data), self.size):
            yield self.data[i:i + self.size]


async def test_stream_gzip_lines_decodes_across_chunk_and_utf8_boundaries():
    body = gzip.compress("code\tproduct_name\n1\tCrème brûlée\n2\tNutella".encode("utf-8"))
    transport = httpx.MockTransport(lambda request: httpx.Response(200, stream=Chunked(body, 7)))
    async with httpx.AsyncClient(transport=transport) as client:
        lines = [line async for line in stream_gzip_lines("https://example.org/dump.csv.gz", client=client)]
    assert lines == ["code\tproduct_name\n", "1\tCrème brûlée\n", "2\tNutella"]


async def test_aiter_tsv_keys_async_lines_by_header():
    async def lines():
        for line in ["code\tproduct_name\n", "1\tNutella\n", "\n"]:
            yield line

    rows_out = [row async for row in aiter_tsv(lines())]
    assert rows_out == [{"code": "1", "product_name": "Nutella"}]
