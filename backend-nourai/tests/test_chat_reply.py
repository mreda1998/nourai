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


def _research_rows():
    from uuid import uuid4

    def claim(kind, text, verdict, certainty, position=0, dose_note=None):
        return SimpleNamespace(kind=kind, claim=text, verdict=verdict, certainty=certainty, position=position, dose_note=dose_note)

    magnesium = SimpleNamespace(id=uuid4(), canonical_name="Magnesium", claims=[
        claim("benefit", "Helps you fall asleep", "limited", "low", 0, "200–350 mg in trials"),
        claim("safety", "High doses cause diarrhoea", "strong", "moderate", 1),
        claim("benefit", "Cures anxiety", "insufficient", "very_low", 2),
    ])
    unresearched = SimpleNamespace(id=uuid4(), canonical_name="Rice flour", claims=[])
    a, b = uuid4(), uuid4()

    def row(pid, product, name, ingredient):
        return SimpleNamespace(product_id=pid, name=name, ingredient=ingredient, product=SimpleNamespace(name=product))

    return [
        row(a, "Sleep Blend", "magnesium glycinate", magnesium),
        row(a, "Sleep Blend", "rice flour", unresearched),
        row(b, "Multivitamin", "magnesium oxide", magnesium),
    ]


def test_research_brief_uses_the_apps_wording_and_lists_overlaps():
    from app.services.chat_context import research_brief

    brief = research_brief(_research_rows())
    assert '"High doses cause diarrhoea": likely risk (moderate certainty)' in brief
    assert '"Helps you fall asleep": may work (low certainty); dose: 200–350 mg in trials' in brief
    assert brief.index("diarrhoea") < brief.index("fall asleep")  # safety first
    assert "Cures anxiety" not in brief and "Rice flour" not in brief
    assert "Magnesium is in Multivitamin, Sleep Blend" in brief


def test_research_reaches_the_prompt_and_its_absence_is_said():
    from app.services.chat_context import research_brief

    ctx = StackContext.model_validate({"products": [], "product_ids": []})
    with_research = _build_system_prompt(ctx, research_brief(_research_rows()))
    assert "Elory's research on ingredients" in with_research
    assert "hasn't reviewed" in with_research
    assert "has not reviewed the ingredients in this stack" in _build_system_prompt(ctx)


def test_claim_answers_match_the_app():
    from app.services.chat_context import claim_answer

    assert claim_answer("benefit", "moderate", "low") == "may work"
    assert claim_answer("benefit", "unlikely", "moderate") == "probably doesn't work"
    assert claim_answer("safety", "unlikely", "moderate") == "no sign of this risk"
    assert claim_answer("safety", "limited", "very_low") == "too early to tell"
    assert claim_answer("benefit", None, None) == "not enough research"
