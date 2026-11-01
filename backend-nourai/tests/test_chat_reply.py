"""What Ask Elory sends back from a Claude response, and what stack context it accepts."""
from types import SimpleNamespace

from app.api.v1.chat import _DECLINED_REPLY, _build_system_prompt, _reply_text
from app.schemas.chat import StackContext


def _response(stop_reason="end_turn", *blocks):
    return SimpleNamespace(stop_reason=stop_reason, content=list(blocks))


def test_the_reply_skips_thinking_blocks_at_the_start():
    thinking = SimpleNamespace(type="thinking", thinking="", signature="sig")
    text = SimpleNamespace(type="text", text="Magnesium glycinate is best taken in the evening.")
    assert _reply_text(_response("end_turn", thinking, text)) == text.text


def test_a_declined_message_gets_a_plain_reply_and_an_empty_one_gets_none():
    assert _reply_text(_response("refusal")) == _DECLINED_REPLY
    assert _reply_text(_response("max_tokens", SimpleNamespace(type="thinking", thinking=""))) is None


def test_products_without_a_grade_are_accepted_and_no_scores_reach_the_prompt():
    ctx = StackContext.model_validate({
        "products": [{"name": "Daily Mag", "category": "supplement", "ingredients": ["Magnesium"]}],
        "domain_scores": {"sleep": 50},
    })
    prompt = _build_system_prompt(ctx)
    assert "Daily Mag" in prompt
    assert "grade" not in prompt and "/100" not in prompt
