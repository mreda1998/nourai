"""
Private Supabase Storage bucket for tester product submissions.

Photos of labels can include people's kitchens and hands, so the bucket is
private: objects are written with the service-role key and read back only
through short-lived signed URLs (the tester report).
"""
from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SEVEN_DAYS = 7 * 24 * 3600


class SubmissionPhotoStore:
    def __init__(self, bucket: str | None = None) -> None:
        self.bucket = bucket or settings.supabase_submissions_bucket
        self._base = settings.supabase_url.rstrip("/")
        self._key = settings.supabase_service_role_key

    @property
    def configured(self) -> bool:
        return bool(self._base and self._key and self.bucket)

    def _headers(self, **extra: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._key}", "apikey": self._key, **extra}

    async def upload(self, path: str, data: bytes, content_type: str) -> None:
        """Write one object; raises httpx.HTTPError on failure."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self._base}/storage/v1/object/{self.bucket}/{path}",
                content=data,
                headers=self._headers(**{"Content-Type": content_type, "x-upsert": "true"}),
            )
            response.raise_for_status()

    async def signed_url(self, path: str, expires_in: int = SEVEN_DAYS) -> str | None:
        """Temporary read URL for one object, or None if signing fails."""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{self._base}/storage/v1/object/sign/{self.bucket}/{path}",
                    json={"expiresIn": expires_in},
                    headers=self._headers(),
                )
                response.raise_for_status()
                signed = response.json().get("signedURL") or response.json().get("signedUrl")
        except (httpx.HTTPError, ValueError):
            logger.warning("could not sign %s", path, exc_info=True)
            return None
        return f"{self._base}/storage/v1{signed}" if signed else None
