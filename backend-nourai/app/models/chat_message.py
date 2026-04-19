"""ChatMessage model — one row per turn in a user's Ask Elory conversation."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import UserProfile


class ChatMessage(Base, UUIDMixin, TimestampMixin):
    """One row = one turn (user or assistant) in the rolling conversation."""

    __tablename__ = "chat_messages"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" or "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)

    user: Mapped["UserProfile"] = relationship("UserProfile", back_populates="chat_messages")

    __table_args__ = (
        Index("ix_chat_messages_user_created", "user_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<ChatMessage user={self.user_id} role={self.role}>"
