"""Curated rules: drafted from a fetched official document, kept only when their quote is really in it."""
from datetime import datetime, timezone

import httpx
import pytest
from pydantic import ValidationError

from app.services.regulation.curation import (
    CheckedPlace,
    CuratedRuleDraft,
    CuratedRuleSet,
    draft_rules,
    quote_in_document,
)
from app.services.regulation.documents import DocumentText, fetch_document

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 11, 4, tzinfo=timezone.utc)


def _doc(text: str, url: str = "https://www.legislation.gov.uk/example") -> DocumentText:
    return DocumentText(url=url, title="Example", text=text, content_hash="h", fetched_at=NOW)


def _draft(**overrides) -> CuratedRuleDraft:
    fields = dict(
        place="GB", authority="MHRA", kind="law", status="prescription_only", applies_to="supplement",
        condition_en="Classed as a medicine; not sold as a supplement",
        legal_reference="Human Medicines Regulations 2012",
        source_quote="Melatonin is a prescription-only medicine in the United Kingdom.",
        quote_location="Section 2",
    )
    fields.update(overrides)
    return CuratedRuleDraft(**fields)


class FakeLLM:
    def __init__(self, result: CuratedRuleSet) -> None:
        self.result, self.prompts = result, []

    async def extract(self, stage, system, prompt, output, effort="medium"):
        self.prompts.append(prompt)
        return self.result


def test_quote_found_across_whitespace_and_quotes():
    document = _doc("Titanium  dioxide\n(E 171) shall not be used’ in food")
    assert quote_in_document("Titanium dioxide (E 171) shall not be used' in food", document)


def test_short_quote_rejected():
    assert not quote_in_document("E 171", _doc("E 171 is not authorised"))


def test_vocabulary_enforced():
    with pytest.raises(ValidationError):
        _draft(status="forbidden")
    with pytest.raises(ValidationError):
        _draft(place="Narnia")
    with pytest.raises(ValidationError):
        _draft(applies_to=None)  # a law always has a product scope
    assert _draft(kind="expert_view", place="JECFA", status="classification",
                  classification="ADI 0-40 mg/kg bw", applies_to=None).applies_to is None


async def test_absent_quote_dropped():
    document = _doc("Melatonin is a prescription-only medicine in the United Kingdom. Other text.")
    llm = FakeLLM(CuratedRuleSet(
        rules=[_draft(), _draft(source_quote="Melatonin may be sold freely as a food supplement in shops.")],
        checked_places=[CheckedPlace(place="GB", applies_to="food")],
    ))
    result = await draft_rules(llm, "Melatonin", ["GB"], [document])
    assert len(result.kept) == 1 and len(result.dropped) == 1
    assert result.kept[0].source_url == document.url
    assert result.checked == [(CheckedPlace(place="GB", applies_to="food"), document.url)]
    assert "Melatonin" in llm.prompts[0] and document.url in llm.prompts[0]


async def test_fetch_document_reads_html_text():
    page = "<html><head><title>Arrêté</title><script>x()</script></head><body><p>Les plantes   autorisées</p></body></html>"
    transport = httpx.MockTransport(lambda request: httpx.Response(200, text=page, headers={"content-type": "text/html"}))
    async with httpx.AsyncClient(transport=transport) as client:
        document = await fetch_document("https://www.legifrance.gouv.fr/x", client)
    assert document.title == "Arrêté"
    assert "Les plantes autorisées" in " ".join(document.text.split())
    assert "x()" not in document.text


def test_saved_document_keeps_its_official_url(tmp_path):
    from app.services.regulation.documents import read_saved_document
    saved = tmp_path / "list.html"
    saved.write_text("<html><title>Prohibited List</title><body>BPC-157 is prohibited at all times.</body></html>")
    document = read_saved_document("https://www.wada-ama.org/en/prohibited-list", saved)
    assert document.url == "https://www.wada-ama.org/en/prohibited-list"
    assert "BPC-157 is prohibited at all times." in document.text



def test_expert_body_cannot_make_law():
    with pytest.raises(ValidationError):
        _draft(place="EFSA", status="banned", applies_to="food_additive")
