"""Chat assistant request/response schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class StackProduct(BaseModel):
    name: str
    brand: str | None = None
    category: str
    grade: str | None = None
    ingredients: list[str] = []


class StackContext(BaseModel):
    products: list[StackProduct] = []
    # Deprecated: older clients sent heuristic grade × category numbers here.
    # They are not evidence and are no longer shown to the model.
    domain_scores: dict[str, float] = {}
    goals: list[str] = []


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    stack_context: StackContext


class ChatResponse(BaseModel):
    message: str


class ChatMessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatHistoryResponse(BaseModel):
    messages: list[ChatMessageResponse]
    total: int
