"""
Checks that a route's sources are real and say what the route claims.

- Every PMID/DOI must resolve.
- Every number in a claim (effect, CI bounds, dose bounds) should appear in the
  cited abstract. When one doesn't, the claim isn't rejected — full texts hold
  numbers abstracts omit — but it's listed in `needs_full_text` so the
  reviewer confirms it explicitly.
- Every ChEBI / Reactome / UniProt identifier must resolve.

Network access goes through a `Fetchers` object so tests never hit the network.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from app.services.routes.schema import ClaimSpec, RouteFile


class Fetchers(Protocol):
    def abstract(self, pmid: str) -> str | None: ...
    def doi_exists(self, doi: str) -> bool: ...
    def chebi_exists(self, chebi_id: str) -> bool: ...
    def reactome_exists(self, stable_id: str) -> bool: ...
    def uniprot_exists(self, accession: str) -> bool: ...


@dataclass
class CheckReport:
    slug: str
    errors: list[str] = field(default_factory=list)
    needs_full_text: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def _fmt(value: float) -> str:
    return f"{abs(value):g}"


def numbers_in(claim: ClaimSpec) -> list[str]:
    """The claim's numbers as they'd be printed in a paper (sign dropped)."""
    values: list[float] = []
    if claim.effect:
        if claim.effect.estimate is not None:
            values.append(claim.effect.estimate)
        values.extend(claim.effect.ci or [])
    if claim.dose:
        values.extend([claim.dose.low, claim.dose.high])
    return list(dict.fromkeys(_fmt(v) for v in values))


def _normalise(text: str) -> str:
    return (
        text.replace("−", "-").replace("–", "-").replace(" ", " ")
        .replace(" ", " ").replace("·", ".")
    )


def _has_number(text: str, number: str) -> bool:
    return re.search(rf"(?<![\d.]){re.escape(number)}(?![\d]|\.\d)", text) is not None


def _has_dose(text: str, number: str, unit: str) -> bool:
    """The number followed by its unit, allowing a range: "3 g", "3-5 g", "3 to 5 g"."""
    pattern = (
        rf"(?<![\d.]){re.escape(number)}(?![\d]|\.\d)"
        rf"(?:\s*(?:-|to)\s*\d+(?:\.\d+)?)?\s*{re.escape(unit)}\b"
    )
    return re.search(pattern, text, re.IGNORECASE) is not None


def missing_numbers(claim: ClaimSpec, abstract: str) -> list[str]:
    text = _normalise(abstract)
    missing: list[str] = []
    if claim.effect:
        values = ([claim.effect.estimate] if claim.effect.estimate is not None else []) + list(claim.effect.ci or [])
        missing += [n for n in dict.fromkeys(_fmt(v) for v in values) if not _has_number(text, n)]
    if claim.dose:
        for n in dict.fromkeys(_fmt(v) for v in (claim.dose.low, claim.dose.high)):
            if not _has_dose(text, n, claim.dose.unit):
                missing.append(n)
    return list(dict.fromkeys(missing))


def check_route(route: RouteFile, fetchers: Fetchers) -> CheckReport:
    report = CheckReport(slug=route.slug)
    abstracts: dict[str, str | None] = {}

    for node in route.nodes:
        if node.chebi and not fetchers.chebi_exists(node.chebi.removeprefix("CHEBI:")):
            report.errors.append(f"node '{node.id}': ChEBI {node.chebi} not found")
        if node.reactome and not fetchers.reactome_exists(node.reactome):
            report.errors.append(f"node '{node.id}': Reactome {node.reactome} not found")
        if node.uniprot and not fetchers.uniprot_exists(node.uniprot):
            report.errors.append(f"node '{node.id}': UniProt {node.uniprot} not found")

    for link in route.links:
        for claim in link.claims:
            texts: list[str] = []
            for c in claim.citations:
                if c.pmid:
                    if c.pmid not in abstracts:
                        abstracts[c.pmid] = fetchers.abstract(c.pmid)
                    if abstracts[c.pmid] is None:
                        report.errors.append(f"PMID {c.pmid} could not be retrieved")
                    else:
                        texts.append(abstracts[c.pmid])
                if c.doi and not fetchers.doi_exists(c.doi):
                    report.errors.append(f"DOI {c.doi} does not resolve")
            if texts:
                missing = missing_numbers(claim, " ".join(texts))
                if missing:
                    report.needs_full_text.append(
                        f"{claim.claim_text} — not in abstract: {', '.join(missing)}"
                    )
    return report


class HttpFetchers:
    """Live lookups against PubMed, Crossref, ChEBI, Reactome and UniProt."""

    def __init__(self, client: httpx.Client | None = None):
        self.client = client or httpx.Client(timeout=20, follow_redirects=True)

    def _ok(self, url: str) -> bool:
        try:
            return self.client.get(url).status_code == 200
        except httpx.HTTPError:
            return False

    def abstract(self, pmid: str) -> str | None:
        try:
            r = self.client.get(
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
                params={"db": "pubmed", "id": pmid, "rettype": "abstract", "retmode": "text"},
            )
        except httpx.HTTPError:
            return None
        text = r.text.strip()
        return text if r.status_code == 200 and f"PMID: {pmid}" in text else None

    def doi_exists(self, doi: str) -> bool:
        return self._ok(f"https://api.crossref.org/works/{doi}")

    def chebi_exists(self, chebi_id: str) -> bool:
        return self._ok(f"https://www.ebi.ac.uk/chebi/backend/api/public/compound/{chebi_id}/")

    def reactome_exists(self, stable_id: str) -> bool:
        return self._ok(f"https://reactome.org/ContentService/data/query/{stable_id}")

    def uniprot_exists(self, accession: str) -> bool:
        return self._ok(f"https://rest.uniprot.org/uniprotkb/{accession}.json?fields=accession")
