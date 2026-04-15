"""
Elory Image Uploader
=====================
Downloads each product's placeholder image URL and re-hosts it in
Supabase Storage so the app is never dependent on third-party CDNs
(Unsplash, OpenFoodFacts, etc.).

Storage layout
--------------
Bucket : product-images   (must be PUBLIC, created in Supabase dashboard)
Path   : products/{product_id}{ext}   e.g. products/abc-123.jpg

Public URL pattern
------------------
{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/products/{product_id}{ext}

Usage
-----
# Upload all products whose image_url is NOT already on Supabase Storage
python scripts/upload_product_images.py

# Preview what would be uploaded without touching the DB or Storage
python scripts/upload_product_images.py --dry-run

# Force re-upload even for images already hosted on Supabase
python scripts/upload_product_images.py --force

# Target a single product by its UUID
python scripts/upload_product_images.py --product-id <uuid>
"""
from __future__ import annotations

import argparse
import asyncio
import mimetypes
import os
import sys
import uuid
from pathlib import PurePosixPath
from urllib.parse import urlparse

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# ── Project root on path ───────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.product import Product

# ─── Constants ────────────────────────────────────────────────────────────────

DOWNLOAD_TIMEOUT = 20.0   # seconds to wait for image download
UPLOAD_TIMEOUT   = 30.0   # seconds to wait for Supabase upload
CONCURRENCY      = 4      # parallel uploads

# Supabase Storage REST endpoint
# POST /storage/v1/object/{bucket}/{path}
STORAGE_UPLOAD_URL = "{supabase_url}/storage/v1/object/{bucket}/{path}"
STORAGE_PUBLIC_URL = "{supabase_url}/storage/v1/object/public/{bucket}/{path}"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _storage_path(product_id: uuid.UUID, source_url: str) -> str:
    """
    Compute the storage path for a product image.
    Preserves the file extension from the source URL (defaults to .jpg).
    """
    parsed = urlparse(source_url)
    suffix = PurePosixPath(parsed.path).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".avif"}:
        suffix = ".jpg"
    return f"products/{product_id}{suffix}"


def _public_url(storage_path: str) -> str:
    """Build the public CDN URL for a Supabase Storage object."""
    return STORAGE_PUBLIC_URL.format(
        supabase_url=settings.supabase_url.rstrip("/"),
        bucket=settings.supabase_storage_bucket,
        path=storage_path,
    )


def _is_already_supabase(url: str | None) -> bool:
    """Return True if the URL is already hosted on this project's Supabase."""
    if not url:
        return False
    return settings.supabase_url.rstrip("/") in url


async def download_image(
    client: httpx.AsyncClient,
    url: str,
) -> tuple[bytes, str] | None:
    """
    Download an image from a URL.
    Returns (raw_bytes, content_type) or None on failure.
    """
    try:
        resp = await client.get(url, timeout=DOWNLOAD_TIMEOUT, follow_redirects=True)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
        # Fallback: guess from URL if content-type is unhelpful
        if content_type in ("application/octet-stream", "binary/octet-stream"):
            guessed, _ = mimetypes.guess_type(url)
            content_type = guessed or "image/jpeg"
        return resp.content, content_type
    except Exception as exc:
        print(f"    [download] Failed {url!r}: {exc}")
        return None


async def upload_to_supabase(
    client: httpx.AsyncClient,
    image_bytes: bytes,
    content_type: str,
    storage_path: str,
) -> bool:
    """
    Upload image bytes to Supabase Storage.
    Uses upsert (x-upsert: true) so repeated runs are idempotent.
    Returns True on success.
    """
    url = STORAGE_UPLOAD_URL.format(
        supabase_url=settings.supabase_url.rstrip("/"),
        bucket=settings.supabase_storage_bucket,
        path=storage_path,
    )
    headers = {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    try:
        resp = await client.post(
            url,
            content=image_bytes,
            headers=headers,
            timeout=UPLOAD_TIMEOUT,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:
        print(f"    [upload] Failed for {storage_path!r}: {exc}")
        return False


# ─── Per-product pipeline ─────────────────────────────────────────────────────

async def process_product(
    product: Product,
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    sem: asyncio.Semaphore,
    force: bool = False,
    dry_run: bool = False,
) -> bool:
    """
    Download and re-host one product's image.
    Returns True if the product's image_url was updated.
    """
    name = product.name
    pid  = product.id
    src  = product.image_url

    if not src:
        print(f"  SKIP  {name!r} — no image_url set")
        return False

    if _is_already_supabase(src) and not force:
        print(f"  SKIP  {name!r} — already on Supabase Storage")
        return False

    storage_path = _storage_path(pid, src)
    public_url   = _public_url(storage_path)

    if dry_run:
        print(f"  DRY   {name!r}")
        print(f"        src  → {src}")
        print(f"        dest → {public_url}")
        return False

    async with sem:
        print(f"  ↓     {name!r} — downloading...")
        result = await download_image(client, src)
        if result is None:
            print(f"  FAIL  {name!r} — download error")
            return False

        image_bytes, content_type = result
        kb = len(image_bytes) // 1024
        print(f"  ↑     {name!r} — uploading {kb} KB ({content_type})...")

        ok = await upload_to_supabase(client, image_bytes, content_type, storage_path)
        if not ok:
            print(f"  FAIL  {name!r} — upload error")
            return False

    # Update image_url in DB
    async with session_factory() as session:
        await session.execute(
            update(Product)
            .where(Product.id == pid)
            .values(image_url=public_url)
        )
        await session.commit()

    print(f"  OK    {name!r} → {public_url}")
    return True


# ─── Entry point ──────────────────────────────────────────────────────────────

async def main(args: argparse.Namespace) -> None:
    # ── Validate ───────────────────────────────────────────────────────────────
    if not args.dry_run:
        if not settings.supabase_url:
            print("ERROR: SUPABASE_URL is not set in .env")
            sys.exit(1)
        if not settings.supabase_service_role_key:
            print(
                "ERROR: SUPABASE_SERVICE_ROLE_KEY is not set in .env\n"
                "       Find it at: Project Settings → API → service_role"
            )
            sys.exit(1)

    # ── DB setup ───────────────────────────────────────────────────────────────
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    # ── Fetch target products ──────────────────────────────────────────────────
    async with session_factory() as session:
        stmt = select(Product)
        if args.product_id:
            try:
                pid = uuid.UUID(args.product_id)
            except ValueError:
                print(f"ERROR: Invalid UUID: {args.product_id!r}")
                sys.exit(1)
            stmt = stmt.where(Product.id == pid)
        result = await session.execute(stmt)
        products = list(result.scalars().all())

    if not products:
        print("No products found.")
        await engine.dispose()
        return

    # Filter to only products that need uploading (unless --force)
    if not args.force and not args.dry_run:
        to_process = [p for p in products if not _is_already_supabase(p.image_url)]
    else:
        to_process = products

    print(f"\nElory Image Uploader")
    print(f"{'='*60}")
    print(f"  Mode:         {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"  Total prods:  {len(products)}")
    print(f"  To upload:    {len(to_process)}")
    print(f"  Bucket:       {settings.supabase_storage_bucket}")
    print(f"  Force:        {'yes' if args.force else 'no'}")
    print(f"{'='*60}\n")

    if not to_process:
        print("Nothing to upload — all products already on Supabase Storage.")
        print("Use --force to re-upload anyway.")
        await engine.dispose()
        return

    sem = asyncio.Semaphore(CONCURRENCY)
    updated = 0

    async with httpx.AsyncClient(
        headers={"User-Agent": "Elory-ImageUploader/1.0"},
        follow_redirects=True,
    ) as client:
        tasks = [
            process_product(p, client, session_factory, sem, args.force, args.dry_run)
            for p in to_process
        ]
        results = await asyncio.gather(*tasks)
        updated = sum(1 for r in results if r)

    await engine.dispose()

    print(f"\n{'='*60}")
    if args.dry_run:
        print(f"  Dry run complete. {len(to_process)} products would be uploaded.")
    else:
        print(f"  Done. {updated}/{len(to_process)} images uploaded to Supabase Storage.")
    print(f"{'='*60}\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Elory Image Uploader — re-host product images in Supabase Storage",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be uploaded without making any changes",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-upload even if the image is already on Supabase Storage",
    )
    parser.add_argument(
        "--product-id",
        metavar="UUID",
        help="Only process this specific product UUID",
    )
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(main(parse_args()))
