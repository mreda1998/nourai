"""Read an official document (HTML page or PDF) as plain text, for curated extraction.

Most documents are fetched from their official URL. Sites that refuse automated clients (WADA's
Prohibited List) are saved from a browser instead and read from disk; the official URL stays the
citation.
"""
from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import httpx
from bs4 import BeautifulSoup
from pypdf import PdfReader

USER_AGENT = "Elory rules curation (+https://elory.app)"


@dataclass(frozen=True)
class DocumentText:
    url: str
    title: str
    text: str
    content_hash: str
    fetched_at: datetime


def document_from_bytes(url: str, raw: bytes, content_type: str = "") -> DocumentText:
    if "pdf" in content_type or raw[:5] == b"%PDF-":
        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        title = (reader.metadata.title if reader.metadata else None) or url.rsplit("/", 1)[-1]
    else:
        soup = BeautifulSoup(raw.decode("utf-8", errors="replace"), "html.parser")
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        title = soup.title.get_text(strip=True) if soup.title else url
        text = soup.get_text("\n")
    return DocumentText(url=url, title=title, text=text, content_hash=hashlib.sha256(raw).hexdigest(),
                        fetched_at=datetime.now(timezone.utc))


async def fetch_document(url: str, client: httpx.AsyncClient) -> DocumentText:
    response = await client.get(url, headers={"User-Agent": USER_AGENT}, follow_redirects=True)
    response.raise_for_status()
    return document_from_bytes(str(response.url), response.content, response.headers.get("content-type", ""))


def read_saved_document(official_url: str, path: Path) -> DocumentText:
    """A copy saved from a browser, cited by its official URL."""
    return document_from_bytes(official_url, path.read_bytes())
