"""
PubMed search and fetch for claim-based research. Each claim is searched as
ingredient names × outcome terms, one query per evidence tier, and papers are
fetched in batches with the metadata that bears on how they were done.
"""
from __future__ import annotations

import asyncio
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.core.config import settings

ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

_FETCH_BATCH = 100
_MIN_ABSTRACT_CHARS = 100

_NOT_RETRACTED = 'NOT ("retracted publication"[pt] OR "retraction of publication"[pt])'
_POOLED = '(meta-analysis[pt] OR "systematic review"[pt])'
_RCT = '"randomized controlled trial"[pt]'
_TIER_FILTERS = {
    "reviews": f"AND humans[mh] AND {_POOLED}",
    "trials": f"AND humans[mh] AND {_RCT}",
    "observational": (
        'AND humans[mh] AND (clinical trial[pt] OR cohort[tiab] OR observational[tiab] '
        'OR "case-control"[tiab] OR cross-sectional[tiab] OR "case reports"[pt]) '
        f"NOT ({_POOLED[1:-1]} OR {_RCT})"
    ),
    # Animal, cell and food-chemistry work: always for safety claims, and for benefit
    # claims with (almost) no human studies — so a verdict can say a belief rests on
    # lab work instead of saying nothing.
    "preclinical": "NOT humans[mh]",
}
TIERS = tuple(_TIER_FILTERS)


@dataclass(slots=True)
class Article:
    pmid: str
    title: str | None
    abstract: str
    journal: str | None
    year: int | None
    doi: str | None
    publication_types: list[str] = field(default_factory=list)
    mesh_terms: list[str] = field(default_factory=list)
    registry_ids: list[str] = field(default_factory=list)
    grant_agencies: list[str] = field(default_factory=list)
    coi_statement: str | None = None
    retracted: bool = False


def build_query(names: list[str], outcome_terms: list[str], tier: str) -> str:
    return (
        f"{_any_of(names)} AND {_any_of(outcome_terms)} "
        f"{_TIER_FILTERS[tier]} {_NOT_RETRACTED}"
    )


class PubMedUnavailable(RuntimeError):
    """PubMed could not be reached after retries — research must fail, not conclude on nothing."""


# Pause before each retry; NCBI rate-limits bursts with 429s.
_RETRY_DELAYS = (1.0, 3.0)


async def search(
    client: httpx.AsyncClient, query: str, retmax: int, sem: asyncio.Semaphore
) -> list[str]:
    params: dict[str, Any] = {
        "db": "pubmed", "term": query, "retmax": retmax, "retmode": "json", "sort": "relevance",
    }
    response = await _get(client, ESEARCH, params, sem, timeout=20.0)
    try:
        return response.json().get("esearchresult", {}).get("idlist", [])
    except ValueError as exc:
        raise PubMedUnavailable(f"unreadable search response: {exc}") from exc


async def fetch_articles(
    client: httpx.AsyncClient, pmids: list[str], sem: asyncio.Semaphore
) -> list[Article]:
    batches = [pmids[i:i + _FETCH_BATCH] for i in range(0, len(pmids), _FETCH_BATCH)]

    async def fetch(batch: list[str]) -> list[Article]:
        params = {"db": "pubmed", "id": ",".join(batch), "retmode": "xml"}
        response = await _get(client, EFETCH, params, sem, timeout=60.0)
        return parse_articles(response.text)

    results = await asyncio.gather(*(fetch(batch) for batch in batches))
    return [article for batch in results for article in batch]


async def _get(
    client: httpx.AsyncClient, url: str, params: dict[str, Any], sem: asyncio.Semaphore, *, timeout: float
) -> httpx.Response:
    if settings.ncbi_api_key:
        params = {**params, "api_key": settings.ncbi_api_key}
    last_error: Exception | None = None
    for delay in (0.0, *_RETRY_DELAYS):
        if delay:
            await asyncio.sleep(delay)
        async with sem:
            try:
                response = await client.get(url, params=params, timeout=timeout)
            except httpx.TransportError as exc:
                last_error = exc
                continue
        if response.status_code == 429 or response.status_code >= 500:
            last_error = httpx.HTTPStatusError(f"HTTP {response.status_code}", request=response.request, response=response)
            continue
        if response.status_code >= 400:
            raise PubMedUnavailable(f"HTTP {response.status_code} from {url}")
        return response
    raise PubMedUnavailable(f"{url} unreachable: {last_error}")


def parse_articles(xml_text: str) -> list[Article]:
    """Papers with a usable abstract, in document order. Retractions are kept and marked."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    articles = []
    for node in root.iter("PubmedArticle"):
        article = _parse_one(node)
        if article is not None:
            articles.append(article)
    return articles


def _parse_one(node: ET.Element) -> Article | None:
    citation = node.find("MedlineCitation")
    if citation is None:
        return None
    pmid = _text(citation.find("PMID"))
    body = citation.find("Article")
    if not pmid or body is None:
        return None

    sections = []
    for part in body.findall("Abstract/AbstractText"):
        text = _text(part)
        if text:
            label = part.get("Label")
            sections.append(f"{label}: {text}" if label else text)
    abstract = "\n".join(sections)
    if len(abstract) < _MIN_ABSTRACT_CHARS:
        return None

    publication_types = [t for t in (_text(e) for e in body.findall("PublicationTypeList/PublicationType")) if t]
    doi = next(
        (_text(e) for e in node.findall("PubmedData/ArticleIdList/ArticleId") if e.get("IdType") == "doi"),
        None,
    )
    return Article(
        pmid=pmid,
        title=_text(body.find("ArticleTitle")),
        abstract=abstract,
        journal=_text(body.find("Journal/Title")),
        year=_year(body),
        doi=doi,
        publication_types=publication_types,
        mesh_terms=[t for t in (_text(e) for e in citation.findall("MeshHeadingList/MeshHeading/DescriptorName")) if t],
        registry_ids=[
            t for t in (_text(e) for e in body.findall("DataBankList/DataBank/AccessionNumberList/AccessionNumber")) if t
        ],
        grant_agencies=sorted({t for t in (_text(e) for e in body.findall("GrantList/Grant/Agency")) if t}),
        coi_statement=_text(citation.find("CoiStatement")),
        retracted="Retracted Publication" in publication_types,
    )


def _any_of(terms: list[str]) -> str:
    cleaned = [t.replace('"', "").strip() for t in terms if t and t.strip()]
    return "(" + " OR ".join(f'"{t}"[tiab]' for t in cleaned) + ")"


def _text(element: ET.Element | None) -> str | None:
    if element is None:
        return None
    text = re.sub(r"\s+", " ", "".join(element.itertext())).strip()
    return text or None


def _year(body: ET.Element) -> int | None:
    for path in ("Journal/JournalIssue/PubDate/Year", "ArticleDate/Year"):
        value = _text(body.find(path))
        if value and value.isdigit():
            return int(value)
    medline = _text(body.find("Journal/JournalIssue/PubDate/MedlineDate"))
    match = re.match(r"(\d{4})", medline or "")
    return int(match.group(1)) if match else None
