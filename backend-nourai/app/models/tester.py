"""
Tester insights: what people scan, search and view, and the products they ask
us to add. Rows are keyed by an anonymous per-install device ID; user_id is
filled in only when the tester happens to be signed in.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDMixin


class TesterEvent(Base, UUIDMixin):
    """One scan / search / product view / stack add / feedback message."""

    __tablename__ = "tester_events"

    device_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(32), nullable=True)  # GTIN-14 for scans
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )
    query: Mapped[str | None] = mapped_column(String(200), nullable=True)
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    app_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_tester_events_device_id", "device_id"),
        Index("ix_tester_events_barcode", "barcode"),
        Index("ix_tester_events_type_created", "event_type", "created_at"),
    )


class ProductSubmission(Base, UUIDMixin):
    """A product a tester could not find and sent to us, usually with label photos."""

    __tablename__ = "product_submissions"

    device_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True
    )
    barcode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(200), nullable=True)
    category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Object keys inside the private submissions bucket, e.g. "<id>/1.jpg".
    photo_paths: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="new", server_default="new")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_product_submissions_device_created", "device_id", "created_at"),
        Index("ix_product_submissions_barcode", "barcode"),
    )
