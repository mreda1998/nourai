"""
Hosted scientific viewers shown in the app through a WebView.

Keeping Mol* and SwissBioPics here (not in the app bundle) keeps the app small
and lets viewers update without a store release. Every parameter is validated
against a strict pattern before it reaches a page, and the image cache only
fetches from an allow-list of open-data hosts.
"""
from __future__ import annotations

import hashlib
import html
import json
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, Response

from app.services.bio_entities import SOURCES

router = APIRouter()

TEMPLATES = Path(__file__).parent / "templates"
CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache" / "viewers"
ALLOWED_HOSTS = {"cdn.rcsb.org", "reactome.org", "www.swissbiopics.org"}
MAX_BYTES = 8 * 1024 * 1024


def _page(name: str, **values: str) -> HTMLResponse:
    text = (TEMPLATES / f"{name}.html").read_text()
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", value)
    return HTMLResponse(text, headers={"Cache-Control": "public, max-age=300"})


@router.get("/cell", response_class=HTMLResponse)
async def cell(sls: str = Query(..., pattern=r"^SL-\d{4}(,SL-\d{4}){0,11}$")) -> HTMLResponse:
    # The component wants bare numbers ("39,86"), not UniProt's "SL-0039".
    bare = ",".join(str(int(x.removeprefix("SL-"))) for x in sls.split(","))
    return _page("cell", SLS=bare, ATTRIBUTION=html.escape(SOURCES["swissbiopics"]["attribution_text"]))


@router.get("/structure", response_class=HTMLResponse)
async def structure(
    pdb: str = Query(..., pattern=r"^[0-9A-Za-z]{4}$"),
    ligand: str = Query("", pattern=r"^[0-9A-Za-z]{0,5}$"),
) -> HTMLResponse:
    return _page(
        "structure",
        PDB=json.dumps(pdb.lower()),
        LIGAND=json.dumps(ligand.upper() or None),
        ATTRIBUTION=html.escape(f"PDB {pdb.upper()} · {SOURCES['rcsb-pdb']['attribution_text']}"),
    )


@router.get("/pathway", response_class=HTMLResponse)
async def pathway(
    ehld: str = Query(..., pattern=r"^R-HSA-\d+$"),
    highlight: str = Query("", pattern=r"^(R-HSA-\d+)?$"),
) -> HTMLResponse:
    return _page(
        "pathway",
        EHLD=json.dumps(ehld),
        HIGHLIGHT=json.dumps(highlight or None),
        ATTRIBUTION=html.escape(SOURCES["reactome-illustrations"]["attribution_text"]),
    )


@router.get("/image")
async def image(url: str = Query(..., max_length=500)) -> Response:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise HTTPException(status_code=400, detail="Host not allowed")

    key = hashlib.sha256(url.encode()).hexdigest()
    body_path, type_path = CACHE_DIR / key, CACHE_DIR / f"{key}.type"
    if body_path.exists() and type_path.exists():
        return Response(body_path.read_bytes(), media_type=type_path.read_text(),
                        headers={"Cache-Control": "public, max-age=86400"})

    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        try:
            upstream = await client.get(url)
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="Upstream unavailable")
    media_type = upstream.headers.get("content-type", "application/octet-stream").split(";")[0]
    if upstream.status_code != 200 or not media_type.startswith("image/") or len(upstream.content) > MAX_BYTES:
        raise HTTPException(status_code=502, detail="Upstream did not return an image")

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    body_path.write_bytes(upstream.content)
    type_path.write_text(media_type)
    return Response(upstream.content, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})
