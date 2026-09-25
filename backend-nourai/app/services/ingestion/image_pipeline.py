"""Authentic product-image verification and deterministic standardization."""
from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from pathlib import PurePosixPath
from uuid import UUID

import httpx
from PIL import Image, ImageFilter, ImageOps, ImageStat, UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.models.ingestion import ProductAsset
from app.models.product import Product


class ImageProcessingError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class ProcessedImage:
    derivative: bytes
    width: int
    height: int
    content_hash: str
    perceptual_hash: str
    quality_score: float
    source_mime_type: str
    original_extension: str


class ProductImagePipeline:
    """Never invents packaging pixels; transforms are deterministic only."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._client = client

    async def process(self, asset_id: UUID) -> None:
        async with self._session_factory() as session:
            asset = await session.get(ProductAsset, asset_id)
            if asset is None or not asset.source_url:
                raise ImageProcessingError(f"Image asset {asset_id} has no source URL")
            source_url = asset.source_url
            product_id = asset.product_id
            asset_type = asset.asset_type

        original, mime_type = await self._download(source_url)
        processed = process_image_bytes(original, mime_type=mime_type)

        original_path: str | None = None
        derivative_path: str | None = None
        public_url = source_url
        verification_status = "source_only"
        if settings.supabase_url and settings.supabase_service_role_key:
            base = PurePosixPath("products") / str(product_id) / str(asset_id)
            original_path = str(base / f"original{processed.original_extension}")
            derivative_path = str(base / f"{asset_type}-1600.jpg")
            await self._upload(original_path, original, processed.source_mime_type)
            await self._upload(derivative_path, processed.derivative, "image/jpeg")
            public_url = (
                f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/"
                f"{settings.supabase_storage_bucket}/{derivative_path}"
            )
            verification_status = "verified"

        async with self._session_factory() as session:
            async with session.begin():
                asset = await session.get(ProductAsset, asset_id, with_for_update=True)
                if asset is None:
                    return
                asset.original_storage_path = original_path
                asset.derivative_storage_path = derivative_path
                asset.public_url = public_url
                asset.content_hash = processed.content_hash
                asset.perceptual_hash = processed.perceptual_hash
                asset.mime_type = processed.source_mime_type
                asset.width = processed.width
                asset.height = processed.height
                asset.quality_score = processed.quality_score
                asset.verification_status = verification_status
                asset.processing_metadata = {
                    "pipeline": "authentic-v1",
                    "operations": [
                        "exif_orientation",
                        "alpha_on_white",
                        "contain_without_upscale",
                        "jpeg_standardization",
                    ],
                    "ai_generation": False,
                    "derivative_max_pixels": 1600,
                }
                if asset.asset_type == "front":
                    product = await session.get(Product, asset.product_id)
                    if product is not None:
                        product.image_url = public_url

    async def mark_failed(self, asset_id: UUID, error: Exception | str) -> None:
        async with self._session_factory() as session:
            async with session.begin():
                asset = await session.get(ProductAsset, asset_id, with_for_update=True)
                if asset is not None:
                    asset.verification_status = "failed"
                    asset.processing_metadata = {
                        **(asset.processing_metadata or {}),
                        "error": str(error)[:1000],
                        "ai_generation": False,
                    }

    async def _download(self, url: str) -> tuple[bytes, str]:
        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(
            timeout=httpx.Timeout(30.0), follow_redirects=True
        )
        try:
            async with client.stream(
                "GET",
                url,
                headers={"User-Agent": settings.openfoodfacts_request_user_agent},
            ) as response:
                response.raise_for_status()
                content_length = int(response.headers.get("content-length") or 0)
                if content_length > settings.image_max_download_bytes:
                    raise ImageProcessingError("Image exceeds the download size limit")
                chunks: list[bytes] = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > settings.image_max_download_bytes:
                        raise ImageProcessingError("Image exceeds the download size limit")
                    chunks.append(chunk)
                mime_type = response.headers.get("content-type", "image/jpeg").split(";")[0]
                return b"".join(chunks), mime_type
        except httpx.HTTPError as exc:
            raise ImageProcessingError(f"Image download failed: {exc}") from exc
        finally:
            if owns_client:
                await client.aclose()

    async def _upload(self, path: str, content: bytes, content_type: str) -> None:
        url = (
            f"{settings.supabase_url.rstrip('/')}/storage/v1/object/"
            f"{settings.supabase_storage_bucket}/{path}"
        )
        headers = {
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "apikey": settings.supabase_service_role_key,
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, content=content, headers=headers)
            if response.status_code not in (200, 201):
                raise ImageProcessingError(
                    f"Storage upload failed with HTTP {response.status_code}"
                )


def process_image_bytes(content: bytes, *, mime_type: str = "image/jpeg") -> ProcessedImage:
    """Decode and standardize an image without generating or reconstructing it."""
    try:
        with Image.open(io.BytesIO(content)) as opened:
            detected_format = opened.format
            image = ImageOps.exif_transpose(opened)
            image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ImageProcessingError("The downloaded file is not a safe raster image") from exc

    if image.width < 32 or image.height < 32:
        raise ImageProcessingError("Image dimensions are too small")

    if image.mode in ("RGBA", "LA") or "transparency" in image.info:
        rgba = image.convert("RGBA")
        flattened = Image.new("RGB", rgba.size, "white")
        flattened.paste(rgba, mask=rgba.getchannel("A"))
        image = flattened
    else:
        image = image.convert("RGB")

    source_width, source_height = image.size
    image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    width, height = image.size
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=88, optimize=True, progressive=True)

    grayscale = image.convert("L")
    edge_variance = ImageStat.Stat(grayscale.filter(ImageFilter.FIND_EDGES)).var[0]
    resolution_score = min(min(source_width, source_height) / 1000.0, 1.0)
    sharpness_score = min(edge_variance / 1200.0, 1.0)
    aspect = max(source_width, source_height) / min(source_width, source_height)
    aspect_score = 1.0 if aspect <= 2 else max(0.0, 1.0 - (aspect - 2) / 4)
    quality_score = round(
        0.55 * resolution_score + 0.30 * sharpness_score + 0.15 * aspect_score,
        3,
    )

    small = grayscale.resize((8, 8), Image.Resampling.LANCZOS)
    pixels = list(small.getdata())
    average = sum(pixels) / len(pixels)
    bits = "".join("1" if pixel >= average else "0" for pixel in pixels)
    perceptual_hash = f"{int(bits, 2):016x}"
    detected_mime = {
        "JPEG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
        "GIF": "image/gif",
    }.get(
        detected_format or "",
        mime_type if mime_type.startswith("image/") else "image/jpeg",
    )
    extension = _extension_for(detected_mime, detected_format)
    return ProcessedImage(
        derivative=output.getvalue(),
        width=width,
        height=height,
        content_hash=hashlib.sha256(content).hexdigest(),
        perceptual_hash=perceptual_hash,
        quality_score=quality_score,
        source_mime_type=detected_mime,
        original_extension=extension,
    )


def _extension_for(mime_type: str, image_format: str | None) -> str:
    by_mime = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }
    if mime_type in by_mime:
        return by_mime[mime_type]
    return f".{(image_format or 'jpg').lower()}"
