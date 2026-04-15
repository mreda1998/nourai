"""
Stack assistant chat endpoint.

POST /chat/message

Accepts a conversation history and the user's full stack context, then
returns a Claude-generated response grounded in evidence-based nutrition
and supplement science.
"""
from __future__ import annotations

import anthropic
from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.schemas.chat import ChatRequest, ChatResponse

router = APIRouter()

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


def _build_system_prompt(ctx: "ChatRequest.stack_context") -> str:  # type: ignore[name-defined]
    from app.schemas.chat import StackContext
    ctx_: StackContext = ctx  # type: ignore[assignment]

    # Products block
    if ctx_.products:
        product_lines = []
        for p in ctx_.products:
            ings = ", ".join(p.ingredients[:8]) if p.ingredients else "unknown ingredients"
            brand = f" by {p.brand}" if p.brand else ""
            product_lines.append(
                f"  • {p.name}{brand} [{p.category}, grade {p.grade}] — key ingredients: {ings}"
            )
        products_block = "Current stack:\n" + "\n".join(product_lines)
    else:
        products_block = "Current stack: empty"

    # Domain scores block
    if ctx_.domain_scores:
        score_lines = [
            f"  • {domain}: {int(score)}/100"
            for domain, score in ctx_.domain_scores.items()
        ]
        scores_block = "Bio-domain evidence scores (0 = no supporting evidence, 100 = strong):\n" + "\n".join(score_lines)
    else:
        scores_block = "Bio-domain scores: not available"

    # Goals block
    goal_labels = [_GOAL_LABELS.get(g, g) for g in ctx_.goals]
    goals_block = (
        f"User health goals: {', '.join(goal_labels)}" if goal_labels
        else "User health goals: not specified"
    )

    return f"""You are Elory's personal stack assistant — a concise, evidence-based health advisor.

{products_block}

{scores_block}

{goals_block}

Your role:
- Answer questions about the user's specific stack with scientific precision
- Reference ingredients by name when making claims
- Distinguish strong evidence (RCTs, meta-analyses) from emerging or anecdotal
- Flag ingredient overlaps, dosage considerations, or potential interactions
- Be direct and concise: 2–4 sentences per point, no fluff
- If something is outside your certainty, say "evidence is limited" — never overstate
- Do NOT recommend buying new products; focus on optimising what the user already has
- Never provide medical diagnoses or replace professional medical advice"""


@router.post("/message", response_model=ChatResponse)
async def chat_message(request: ChatRequest) -> ChatResponse:
    """
    Send a message to the Elory stack assistant.

    The conversation history (messages) and the user's stack context are
    forwarded to Claude. The assistant returns a single reply grounded in
    the user's actual ingredients and domain evidence scores.
    """
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="AI assistant is not configured on this server.",
        )

    if not request.messages:
        raise HTTPException(status_code=400, detail="messages array is required")

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    system_prompt = _build_system_prompt(request.stack_context)

    # Convert to Anthropic message format
    anthropic_messages = [
        {"role": msg.role, "content": msg.content}
        for msg in request.messages
        if msg.role in ("user", "assistant")
    ]

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=system_prompt,
            messages=anthropic_messages,
        )
        reply = response.content[0].text
    except anthropic.APIError as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}") from exc

    return ChatResponse(message=reply)
