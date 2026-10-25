"""Requests the research stages send: refusal fallback only where the model has one."""
from types import SimpleNamespace

import pytest

from app.services.research.llm import ResearchLLM
from tests.research_factories import make_appraisal, make_article, make_claim

pytestmark = pytest.mark.anyio


class RecordingClient:
    def __init__(self):
        self.requests: list[dict] = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(parse=self._parse))

    async def _parse(self, **kwargs):
        self.requests.append(kwargs)
        usage = SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=0,
                                cache_creation_input_tokens=0)
        return SimpleNamespace(stop_reason="end_turn", stop_details=None, usage=usage, parsed_output=make_appraisal())


async def test_haiku_appraisals_send_no_server_side_fallback_while_opus_stages_do():
    client = RecordingClient()
    llm = ResearchLLM(client, model="claude-opus-5-5", appraisal_model="claude-haiku-5-5")
    claims = [make_claim("Eases joint pain")]

    await llm.appraise("Curcumin", claims, make_article("1"))
    await llm.draft_claims("Curcumin", "herb", [], None)

    haiku, opus = client.requests
    assert haiku["model"] == "claude-haiku-5-5"
    assert "fallbacks" not in haiku and "betas" not in haiku
    assert opus["model"] == "claude-opus-5-5"
    assert opus["fallbacks"] == "default" and opus["betas"] == ["server-side-fallback-2026-07-01"]
    assert llm.usage["appraisal"]["calls"] == 1
