"""
Best-effort recording of tester activity (scans, searches, views, feedback).

Every write uses its own session and swallows failures: analytics must never
turn a working product lookup into an error for the person holding the phone.
"""
from __future__ import annotations

import logging
import re
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.session import async_session_factory
from app.models.tester import TesterEvent

logger = logging.getLogger(__name__)

_DEVICE_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")

EVENT_TYPES = frozenset({"scan", "search", "product_view", "stack_add", "feedback"})
# Scans are recorded by the barcode endpoint itself, never reported by clients.
CLIENT_EVENT_TYPES = EVENT_TYPES - {"scan"}


def clean_device_id(raw: str | None) -> str | None:
    """Return the device ID if it looks like one we issued, else None."""
    value = (raw or "").strip()
    return value if _DEVICE_ID.match(value) else None


async def record_event(
    *,
    device_id: str | None,
    event_type: str,
    user_id: UUID | None = None,
    barcode: str | None = None,
    product_id: UUID | None = None,
    query: str | None = None,
    meta: dict[str, Any] | None = None,
    app_version: str | None = None,
    session_factory: async_sessionmaker[AsyncSession] = async_session_factory,
) -> None:
    """Store one tester event. No-op without a device ID; never raises."""
    if not device_id or event_type not in EVENT_TYPES:
        return
    try:
        async with session_factory() as session:
            session.add(
                TesterEvent(
                    device_id=device_id,
                    event_type=event_type,
                    user_id=user_id,
                    barcode=barcode,
                    product_id=product_id,
                    query=(query or "").strip()[:200] or None,
                    meta=meta or {},
                    app_version=(app_version or "")[:32] or None,
                )
            )
            await session.commit()
    except Exception:
        logger.warning("could not record %s event", event_type, exc_info=True)
