"""Chat assistant request/response schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class StackProduct(BaseModel):
    name: str
    brand: str | None = None
    category: str
    grade: str | None = None  # no longer used; older app builds still send it
    ingredients: list[str] = []


class StackContext(BaseModel):
    products: list[StackProduct] = []
    # Library products in the stack, so the reply can use Elory's own research on them.
    product_ids: list[UUID] = Field(default_factory=list, max_length=50)
    domain_scores: dict[str, float] = {}  # no longer used; older app builds still send it
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
