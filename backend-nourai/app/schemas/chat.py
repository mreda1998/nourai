"""Chat assistant request/response schemas."""
from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class StackProduct(BaseModel):
    name: str
    brand: str | None = None
    category: str
    grade: str
    ingredients: list[str] = []


class StackContext(BaseModel):
    products: list[StackProduct] = []
    domain_scores: dict[str, float] = {}
    goals: list[str] = []


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    stack_context: StackContext


class ChatResponse(BaseModel):
    message: str
