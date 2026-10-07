"""
The catalog import loop: rows in, batched upserts out.

Source-agnostic and storage-agnostic — `parse` turns a dump row into a
CatalogRow (or None to skip it) and `sink` writes batches. Two guards protect
the index: a format guard (a dump that mostly fails to parse aborts before
its first write) and the sink's size check (before the first write and every
few batches). Upserts never delete, so a truncated dump cannot wipe anything.
"""
from __future__ import annotations

from collections import Counter
from collections.abc import AsyncIterable, Callable, Iterable
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.services.catalog.records import CatalogRow


class ImportAborted(RuntimeError):
    """The run stopped on purpose: a format change, or the storage budget."""


@dataclass
class ImportStats:
    read: int = 0
    parsed: int = 0
    skipped: int = 0
    inserted: int = 0
    updated: int = 0
    additives: Counter = field(default_factory=Counter)

    def as_dict(self, top_additives: int = 200) -> dict[str, Any]:
        return {
            "read": self.read,
            "parsed": self.parsed,
            "skipped": self.skipped,
            "inserted": self.inserted,
            "updated": self.updated,
            "top_additives": dict(self.additives.most_common(top_additives)),
        }


class CatalogSink(Protocol):
    async def write_batch(self, rows: list[CatalogRow]) -> tuple[int, int]: ...
    async def checkpoint(self, line: int, stats: ImportStats) -> None: ...
    async def check_size(self) -> None: ...


class DryRunSink:
    """Counts what would be written; touches nothing."""

    def __init__(self) -> None:
        self.rows = 0

    async def write_batch(self, rows: list[CatalogRow]) -> tuple[int, int]:
        self.rows += len(rows)
        return 0, 0

    async def checkpoint(self, line: int, stats: ImportStats) -> None:
        return None

    async def check_size(self) -> None:
        return None


async def run_import(
    rows: Iterable[dict[str, str]] | AsyncIterable[dict[str, str]],
    *,
    parse: Callable[[dict[str, str]], CatalogRow | None],
    sink: CatalogSink,
    batch_size: int = 2000,
    resume_from: int = 0,
    limit: int | None = None,
    sanity_after: int = 50_000,
    min_valid_ratio: float = 0.2,
    size_check_every: int = 50,
) -> ImportStats:
    stats = ImportStats()
    pending: list[tuple[int, CatalogRow]] = []
    line = 0
    batches = 0
    sane = False
    checkpointed = 0

    def check_format() -> None:
        if stats.read and stats.parsed / stats.read < min_valid_ratio:
            raise ImportAborted(
                f"only {stats.parsed} of {stats.read} rows parsed — has the dump format changed?"
            )

    async def flush(*, final: bool) -> None:
        nonlocal batches, checkpointed
        while pending and (final or len(pending) >= batch_size):
            chunk = pending[:batch_size]
            del pending[:batch_size]
            if batches == 0:
                await sink.check_size()
            inserted, updated = await sink.write_batch([row for _, row in chunk])
            stats.inserted += inserted
            stats.updated += updated
            batches += 1
            # Every row up to the batch's last line is now written or skipped.
            checkpointed = chunk[-1][0]
            await sink.checkpoint(checkpointed, stats)
            if batches % size_check_every == 0:
                await sink.check_size()

    async for raw in _aiter(rows):
        line += 1
        if line <= resume_from:
            continue
        if limit is not None and stats.read >= limit:
            break
        stats.read += 1
        row = parse(raw)
        if row is None:
            stats.skipped += 1
        else:
            stats.parsed += 1
            stats.additives.update(row.additives)
            pending.append((line, row))

        if not sane and stats.read >= sanity_after:
            check_format()
            sane = True
        if sane:
            await flush(final=False)

    if not sane:
        check_format()
    await flush(final=True)
    if line > checkpointed and stats.read:
        await sink.checkpoint(min(line, resume_from + stats.read), stats)
    return stats


async def _aiter(rows: Iterable[Any] | AsyncIterable[Any]):
    if hasattr(rows, "__aiter__"):
        async for row in rows:  # type: ignore[union-attr]
            yield row
    else:
        for row in rows:  # type: ignore[union-attr]
            yield row
