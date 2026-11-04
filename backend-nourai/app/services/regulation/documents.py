"""Fetch an official document (HTML page or PDF) as plain text, for curated extraction."""
from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from datetime import datetime, timezone

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


async def fetch_document(url: str, client: httpx.AsyncClient) -> DocumentText:
    response = await client.get(url, headers={"User-Agent": USER_AGENT}, follow_redirects=True)
    response.raise_for_status()
    raw = response.content
    if "pdf" in response.headers.get("content-type", "") or raw[:5] == b"%PDF-":
        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        title = (reader.metadata.title if reader.metadata else None) or url.rsplit("/", 1)[-1]
    else:
        soup = BeautifulSoup(response.text, "html.parser")
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        title = soup.title.get_text(strip=True) if soup.title else url
        text = soup.get_text("\n")
    return DocumentText(url=str(response.url), title=title, text=text,
                        content_hash=hashlib.sha256(raw).hexdigest(), fetched_at=datetime.now(timezone.utc))
