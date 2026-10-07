"""Stream a gzipped text dump over HTTP line by line — never to disk, never whole in memory."""
from __future__ import annotations

import codecs
import zlib
from collections.abc import AsyncIterator

import httpx

from app.core.config import settings


async def stream_gzip_lines(
    url: str,
    *,
    client: httpx.AsyncClient | None = None,
    chunk_size: int = 1 << 16,
) -> AsyncIterator[str]:
    owns_client = client is None
    client = client or httpx.AsyncClient(
        follow_redirects=True, timeout=httpx.Timeout(60.0, read=300.0)
    )
    inflate = zlib.decompressobj(16 + zlib.MAX_WBITS)
    decode = codecs.getincrementaldecoder("utf-8")(errors="replace")
    pending = ""
    try:
        headers = {"User-Agent": settings.openfoodfacts_request_user_agent}
        async with client.stream("GET", url, headers=headers) as response:
            response.raise_for_status()
            # Raw bytes: the dump is a .gz file, not a gzip content-encoding.
            async for chunk in response.aiter_raw(chunk_size):
                pending += decode.decode(inflate.decompress(chunk))
                *lines, pending = pending.split("\n")
                for line in lines:
                    yield line + "\n"
        pending += decode.decode(inflate.flush(), final=True)
        if pending:
            yield pending
    finally:
        if owns_client:
            await client.aclose()
