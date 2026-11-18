"""
Stack assistant chat endpoint.

POST /chat/message  — send message, persists both turns (best-effort)
GET  /chat/history  — paginated history for authenticated user
DELETE /chat/history — hard-delete all messages for authenticated user
"""
from __future__ import annotations

import anthropic
from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, func, select

from app.api.deps import CurrentUser, DBSession, PremiumUser
from app.core.config import settings
from app.models.chat_message import ChatMessage
from app.services.chat_context import research_brief
from app.services.stack_score import load_product_ingredients
from app.schemas.chat import (
    ChatHistoryResponse,
    ChatMessageResponse,
    ChatRequest,
    ChatResponse,
)

router = APIRouter()

CHAT_MODEL = "claude-sonnet-5-5"
# Declines in the cyber and frontier_llm categories are retried on another model inside the call.
_FALLBACK = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}
_DECLINED_REPLY = "Sorry, I can't help with that one. Try asking about the ingredients in your stack."

_GOAL_LABELS: dict[str, str] = {
    "clear_skin": "Clear Skin",
    "anti_aging": "Anti-Aging",
    "brighter_skin": "Brighter Skin",
    "hair_growth": "Hair Growth",
    "prevent_hair_loss": "Hair Loss Prevention",
    "build_muscle": "Build Muscle",
    "fat_loss": "Fat Loss",
    "more_energy": "More Energy",
    "gut_health": "Gut Health",
    "less_inflammation": "Less Inflammation",
    "mental_focus": "Mental Focus",
    "reduce_stress": "Reduce Stress",
    "better_sleep": "Better Sleep",
    "recovery": "Recovery",
}


def _build_system_prompt(ctx: "ChatRequest.stack_context", research: str = "") -> str:  # type: ignore[name-defined]
    from app.schemas.chat import StackContext
    ctx_: StackContext = ctx  # type: ignore[assignment]

    # Products block
    if ctx_.products:
        product_lines = []
        for p in ctx_.products:
            ings = ", ".join(p.ingredients[:8]) if p.ingredients else "unknown ingredients"
            brand = f" by {p.brand}" if p.brand else ""
            product_lines.append(f"  • {p.name}{brand} [{p.category}] — key ingredients: {ings}")
        products_block = "Current stack:\n" + "\n".join(product_lines)
    else:
        products_block = "Current stack: empty"

    # Goals block
    goal_labels = [_GOAL_LABELS.get(g, g) for g in ctx_.goals]
    goals_block = (
        f"User health goals: {', '.join(goal_labels)}" if goal_labels
        else "User health goals: not specified"
    )

    research_block = (
        f"{research}\n\nThese verdicts come from Elory's own review of the studies. When they cover the "
        "question, answer from them and say how certain they are, in the same words. When they don't, "
        "say Elory hasn't reviewed that yet before answering from general knowledge."
        if research else
        "Elory has not reviewed the ingredients in this stack yet. Say so when it matters, and answer cautiously."
    )

    return f"""You are Elory's personal stack assistant — a concise, evidence-based health advisor.

{products_block}

{goals_block}

{research_block}

Your role:
- Answer questions about the user's specific stack with scientific precision
- Reference ingredients by name when making claims
- Distinguish strong evidence (RCTs, meta-analyses) from emerging or anecdotal
- Flag ingredient overlaps, dosage considerations, or potential interactions
- Be direct and concise: 2–4 sentences per point, no fluff
- Write plain text: the app shows replies as-is, so markdown (asterisks, # headings, bullet symbols) appears literally. Separate points with blank lines instead
- If something is outside your certainty, say "evidence is limited" — never overstate
- Do NOT recommend buying new products; focus on optimising what the user already has
- Never provide medical diagnoses or replace professional medical advice"""


@router.get("/history", response_model=ChatHistoryResponse)
async def get_chat_history(
    db: DBSession,
    current_user: CurrentUser,
    limit: int = 50,
    offset: int = 0,
) -> ChatHistoryResponse:
    """Return paginated chat history for the current user, oldest-first."""
    total_result = await db.execute(
        select(func.count()).where(ChatMessage.user_id == current_user.id)
    )
    total = total_result.scalar_one()

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
        .offset(offset)
    )
    messages = result.scalars().all()

    return ChatHistoryResponse(
        messages=[ChatMessageResponse.model_validate(m) for m in messages],
        total=total,
    )


@router.delete("/history", status_code=200)
async def clear_chat_history(
    db: DBSession,
    current_user: CurrentUser,
) -> dict:
    """Hard-delete all chat messages for the current user."""
    await db.execute(
        delete(ChatMessage).where(ChatMessage.user_id == current_user.id)
    )
    await db.commit()
    return {}


@router.post("/message", response_model=ChatResponse)
async def chat_message(
    request: ChatRequest,
    db: DBSession,
    current_user: PremiumUser,
) -> ChatResponse:
    """
    Send a message to the Elory stack assistant.

    The conversation history (messages) and the user's stack context are
    forwarded to Claude. The assistant returns a single reply grounded in
    the user's actual ingredients and Elory's research on them.
    Both turns are persisted for authenticated users (best-effort).
    """
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="AI assistant is not configured on this server.",
        )

    if not request.messages:
        raise HTTPException(status_code=400, detail="messages array is required")

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    research = ""
    if request.stack_context.product_ids:
        rows = await load_product_ingredients(db, request.stack_context.product_ids)
        research = research_brief(rows)
    system_prompt = _build_system_prompt(request.stack_context, research)

    # Convert to Anthropic message format
    anthropic_messages = [
        {"role": msg.role, "content": msg.content}
        for msg in request.messages
        if msg.role in ("user", "assistant")
    ]

    try:
        response = await client.beta.messages.create(
            model=CHAT_MODEL,
            max_tokens=4096,  # room for brief thinking plus the reply
            **_FALLBACK,
            output_config={"effort": "low"},
            system=system_prompt,
            messages=anthropic_messages,
        )
    except anthropic.APIError as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}") from exc
    reply = _reply_text(response)
    if reply is None:
        raise HTTPException(status_code=502, detail="AI service returned no reply")

    # Persist both turns — best-effort, never blocks the user
    if current_user is not None:
        try:
            last_user_content = request.messages[-1].content
            db.add(ChatMessage(user_id=current_user.id, role="user", content=last_user_content))
            db.add(ChatMessage(user_id=current_user.id, role="assistant", content=reply))
            await db.commit()
        except Exception:
            await db.rollback()

    return ChatResponse(message=reply)


def _reply_text(response) -> str | None:
    """The visible reply. A response can open with thinking blocks, so read text blocks by type."""
    if response.stop_reason == "refusal":
        return _DECLINED_REPLY
    text = "".join(block.text for block in response.content if block.type == "text").strip()
    return text or None
