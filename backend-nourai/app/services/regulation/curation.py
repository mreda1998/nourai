"""Curated rules: Claude drafts them from an official document; code checks every quote; a person approves.

Claude is never asked for a rule without the document in the prompt, and a draft whose verbatim quote
is not in that document is dropped. Drafts and proposed checks are stored unserved until reviewed.
"""
from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.regulation import EXPERT_BODIES, LAW_STATUSES, PLACES, SCOPES
from app.models.ingestion import DataSource, SourceRecord
from app.models.regulation import RegulatoryRule, RuleCheck
from app.services.regulation.documents import DocumentText

CURATED_SOURCE = "curated-documents"
MIN_QUOTE = 20
MAX_DOCUMENT_CHARS = 150_000


class CuratedRuleDraft(BaseModel):
    place: str = Field(description=f"One of {', '.join(PLACES + EXPERT_BODIES)}")
    authority: str = Field(description="The body that made the rule, e.g. 'MHRA', 'ANSES', 'Health Canada'")
    kind: str = Field(description="'law' when it binds anyone in that place; 'expert_view' for an opinion")
    status: str = Field(description=f"For a law one of {', '.join(LAW_STATUSES)}; for an expert view 'classification'")
    classification: str | None = Field(None, description="Expert views only: the body's own label, e.g. 'Group 2B'")
    applies_to: str | None = Field(None, description=f"One of {', '.join(SCOPES)}; null only for expert views")
    sub_scope: str | None = Field(None, description="Narrower scope, e.g. 'leave-on products', 'children under 3'")
    condition_en: str | None = Field(None, description="The condition or limit in plain English (translated if needed)")
    limit_value: float | None = None
    limit_unit: str | None = None
    limit_basis: str | None = None
    effective_from: date | None = None
    effective_until: date | None = None
    legal_reference: str | None = Field(None, description="The instrument and article, e.g. 'Regulation (EU) 2022/860, Article 1'")
    source_quote: str = Field(description="The exact passage this rule rests on, copied verbatim in the document's language")
    quote_location: str = Field(description="Where in the document the quote is: article, section, table or page")
    why: str | None = Field(None, description="One plain line on why the rule exists, only if the document says so")
    source_url: str | None = Field(None, description="Leave empty; filled in by code")

    @field_validator("place")
    @classmethod
    def _place(cls, value: str) -> str:
        if value not in PLACES + EXPERT_BODIES:
            raise ValueError(f"unknown place {value!r}")
        return value

    @model_validator(mode="after")
    def _vocabulary(self) -> "CuratedRuleDraft":
        if self.kind == "law":
            if self.status not in LAW_STATUSES:
                raise ValueError(f"unknown law status {self.status!r}")
            if self.applies_to not in SCOPES:
                raise ValueError("a law needs a product scope")
        elif self.kind == "expert_view":
            if self.status != "classification" or self.place not in EXPERT_BODIES:
                raise ValueError("an expert view is a classification by an expert body")
            if self.applies_to is not None and self.applies_to not in SCOPES:
                raise ValueError(f"unknown scope {self.applies_to!r}")
        else:
            raise ValueError(f"unknown kind {self.kind!r}")
        return self


class CheckedPlace(BaseModel):
    place: str
    applies_to: str


class CuratedRuleSet(BaseModel):
    rules: list[CuratedRuleDraft] = []
    checked_places: list[CheckedPlace] = Field(
        default_factory=list,
        description="Places and scopes this document fully covers for the substance and where it sets no rule",
    )


CURATION_SYSTEM = f"""You extract what one official legal or regulatory document says about one substance.

Rules:
- Extract only what this document states. If it is silent on the substance, return no rules.
- source_quote must be copied verbatim from the document, in its own language, long enough to prove the rule.
- Use only these places: {', '.join(PLACES)}; expert bodies: {', '.join(EXPERT_BODIES)}.
- A law's status is one of: {', '.join(LAW_STATUSES)}. Its applies_to is one of: {', '.join(SCOPES)}.
- An expert body's opinion is kind "expert_view", status "classification", with its own label in
  classification, and no applies_to. Never describe an expert view as banned or allowed.
- condition_en is the condition or limit in plain English; translate from French, German or Italian.
- A substance classed as a prescription-only medicine in this place but sold as a supplement elsewhere is
  applies_to "supplement", status "prescription_only", condition_en "Classed as a medicine; not sold as a
  supplement" (melatonin in the UK).
- A prescription-only rule on a skin product is given twice: once for "cosmetic", once for "medicine".
- WADA entries are place "WADA", applies_to "sport", with the list section and "at all times" or
  "in-competition" in sub_scope.
- effective_from / effective_until only when the document states the date.
- checked_places: only places and scopes this document fully covers for the substance with no rule."""


def normalize_for_quote(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).replace("­", "")
    text = re.sub(r"[‘’‚′`]", "'", text)
    text = re.sub(r"[“”„″]", '"', text)
    return re.sub(r"\s+", " ", text).strip().casefold()


def quote_in_document(quote: str, document: DocumentText) -> bool:
    needle = normalize_for_quote(quote)
    return len(needle) >= MIN_QUOTE and needle in normalize_for_quote(document.text)


@dataclass
class DraftResult:
    kept: list[CuratedRuleDraft] = field(default_factory=list)
    dropped: list[CuratedRuleDraft] = field(default_factory=list)
    checked: list[tuple[CheckedPlace, str]] = field(default_factory=list)  # (place, document url)


async def draft_rules(llm, substance_name: str, places: list[str], documents: list[DocumentText]) -> DraftResult:
    """One extraction per document; keep a draft only when its quote is found in that document."""
    result = DraftResult()
    for document in documents:
        prompt = "\n".join([
            f"Substance: {substance_name}",
            f"Places to report on: {', '.join(places)}",
            f"Document: {document.title}",
            f"URL: {document.url}",
            "", "Document text:", document.text[:MAX_DOCUMENT_CHARS],
        ])
        extracted = await llm.extract("curation", CURATION_SYSTEM, prompt, CuratedRuleSet, effort="high")
        if extracted is None:
            continue
        for draft in extracted.rules:
            draft.source_url = document.url
            (result.kept if quote_in_document(draft.source_quote, document) else result.dropped).append(draft)
        result.checked += [(check, document.url) for check in extracted.checked_places
                           if check.place in places and check.applies_to in SCOPES]
    return result


async def _curated_source(session: AsyncSession) -> DataSource:
    source = (await session.execute(select(DataSource).where(DataSource.slug == CURATED_SOURCE))).scalar_one_or_none()
    if source is None:
        source = DataSource(slug=CURATED_SOURCE, name="Official documents (curated)", source_type="regulatory_document",
                            extra_data={})
        session.add(source)
        await session.flush()
    return source


async def store_drafts(
    session: AsyncSession, substance_id: uuid.UUID, result: DraftResult, documents: list[DocumentText], now: datetime
) -> int:
    source = await _curated_source(session)
    records: dict[str, uuid.UUID] = {}
    for document in documents:
        record = (await session.execute(select(SourceRecord).where(
            SourceRecord.source_id == source.id, SourceRecord.record_type == "regulatory_document",
            SourceRecord.external_id == document.url[:255], SourceRecord.content_hash == document.content_hash,
        ))).scalar_one_or_none()
        if record is None:
            record = SourceRecord(source_id=source.id, external_id=document.url[:255], record_type="regulatory_document",
                                  request_url=document.url, content_hash=document.content_hash,
                                  fetched_at=document.fetched_at, payload={"title": document.title})
            session.add(record)
            await session.flush()
        records[document.url] = record.id

    for draft in result.kept:
        session.add(RegulatoryRule(
            substance_id=substance_id, place=draft.place, authority=draft.authority, kind=draft.kind,
            status=draft.status, classification=draft.classification, applies_to=draft.applies_to,
            sub_scope=draft.sub_scope, condition=draft.condition_en, limit_value=draft.limit_value,
            limit_unit=draft.limit_unit, limit_basis=draft.limit_basis, effective_from=draft.effective_from,
            effective_until=draft.effective_until, legal_reference=draft.legal_reference,
            source_url=draft.source_url, source_id=source.id, source_record_id=records.get(draft.source_url),
            source_quote=f"{draft.source_quote} [{draft.quote_location}]", why=draft.why,
            last_checked_at=now, origin="curated", review_status="draft",
        ))

    for check, url in result.checked:
        existing = (await session.execute(select(RuleCheck).where(
            RuleCheck.substance_id == substance_id, RuleCheck.place == check.place,
            RuleCheck.applies_to == check.applies_to,
        ))).scalar_one_or_none()
        if existing is None:
            session.add(RuleCheck(substance_id=substance_id, place=check.place, applies_to=check.applies_to,
                                  checked_at=now, origin="curated", status="pending", source_id=source.id,
                                  documents=[url]))
        elif existing.status == "pending" and url not in existing.documents:
            existing.documents = [*existing.documents, url]
    await session.flush()
    return len(result.kept)
