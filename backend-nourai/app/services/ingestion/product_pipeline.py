"""Canonical product ingestion with immutable revisions and quality gates."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingredient import Ingredient, IngredientCategory
from app.models.ingestion import (
    DataSource,
    IngestionJob,
    ProductAsset,
    ProductIdentifier,
    ProductIngredientOccurrence,
    ProductRevision,
    PublicationStatus,
    QualityIssue,
    ReviewTask,
    SourceRecord,
)
from app.models.product import IngredientStatus, Product, ProductIngredient
from app.models.unmatched_ingredient_log import UnmatchedIngredientLog
from app.services.ingestion.connectors.base import SourceInfo
from app.services.ingestion.connectors.chain import ProductConnector, default_connector
from app.services.ingestion.connectors.openfoodfacts import OpenFoodFactsRecord
from app.services.ingestion.normalization import canonical_content_hash
from app.services.ingestion.parser import ParsedIngredient, parse_off_ingredients
from app.services.ingestion.resolver import IngredientResolution, resolve_ingredients


@dataclass(frozen=True, slots=True)
class ProductIngestionResult:
    product_id: UUID | None
    source_record_id: UUID
    asset_ids: tuple[UUID, ...] = ()
    revision_created: bool = False
    needs_review: bool = False
    message: str | None = None


class ProductIngestionPipeline:
    def __init__(self, connector: ProductConnector | None = None) -> None:
        self._connector = connector or default_connector()

    async def ingest_barcode(
        self,
        session: AsyncSession,
        *,
        barcode: str,
        gtin14: str,
        job: IngestionJob,
    ) -> ProductIngestionResult:
        record = await self._connector.fetch_product(barcode)
        now = datetime.now(timezone.utc)

        async with session.begin():
            # Serializes only work for this identifier. Multiple workers still
            # ingest different products concurrently.
            await session.execute(
                text("SELECT pg_advisory_xact_lock(hashtext(:identifier))"),
                {"identifier": gtin14},
            )
            source = await self._get_or_create_source(session, record.source)
            source_record = await self._snapshot_source(session, source, record)

            has_ingredients = bool(
                record.ingredient_statement or record.product.get("ingredients")
            )
            if not record.name or not has_ingredients:
                missing = [
                    field
                    for field, present in (
                        ("name", bool(record.name)),
                        ("ingredients", has_ingredients),
                    )
                    if not present
                ]
                session.add(
                    QualityIssue(
                        source_record_id=source_record.id,
                        ingestion_job_id=job.id,
                        code="missing_required_product_fields",
                        severity="error",
                        message=f"Required fields are missing: {', '.join(missing)}",
                        details={"fields": missing, "gtin14": gtin14},
                    )
                )
                session.add(
                    ReviewTask(
                        task_type="product_source_review",
                        priority=20,
                        entity_type="source_record",
                        entity_id=source_record.id,
                        payload={"fields": missing, "gtin14": gtin14},
                    )
                )
                return ProductIngestionResult(
                    product_id=None,
                    source_record_id=source_record.id,
                    needs_review=True,
                    message="Source record needs editorial review",
                )

            product = await self._find_product(session, barcode, gtin14)
            if product is None:
                product = Product(
                    barcode=barcode,
                    name=record.name,
                    brand=record.brand,
                    category=record.category.value,
                    serving_size=record.product.get("serving_size"),
                    publication_status=PublicationStatus.PUBLISHED.value,
                    last_ingested_at=now,
                    extra_data={},
                )
                session.add(product)
                await session.flush()

            identifier = (
                await session.execute(
                    select(ProductIdentifier).where(
                        ProductIdentifier.scheme == "gtin",
                        ProductIdentifier.value == gtin14,
                        ProductIdentifier.market_country == "",
                    )
                )
            ).scalar_one_or_none()
            if identifier is None:
                session.add(
                    ProductIdentifier(
                        product_id=product.id,
                        scheme="gtin",
                        value=gtin14,
                        market_country="",
                        is_primary=True,
                    )
                )

            normalized = record.normalized_payload()
            revision_hash = canonical_content_hash(normalized)
            current_revision = (
                await session.execute(
                    select(ProductRevision).where(
                        ProductRevision.product_id == product.id,
                        ProductRevision.content_hash == revision_hash,
                        ProductRevision.is_current.is_(True),
                    )
                )
            ).scalar_one_or_none()

            self._update_projection(product, record, normalized, now)
            if current_revision is not None:
                asset_ids = await self._write_assets(
                    session, product, current_revision, source_record, record
                )
                return ProductIngestionResult(
                    product_id=product.id,
                    source_record_id=source_record.id,
                    asset_ids=tuple(asset_ids),
                    revision_created=False,
                )

            await session.execute(
                update(ProductRevision)
                .where(
                    ProductRevision.product_id == product.id,
                    ProductRevision.is_current.is_(True),
                )
                .values(is_current=False, effective_to=now)
            )
            highest_revision = (
                await session.execute(
                    select(func.coalesce(func.max(ProductRevision.revision_number), 0)).where(
                        ProductRevision.product_id == product.id
                    )
                )
            ).scalar_one()
            revision = ProductRevision(
                product_id=product.id,
                source_record_id=source_record.id,
                revision_number=highest_revision + 1,
                content_hash=revision_hash,
                is_current=True,
                publication_status=PublicationStatus.PUBLISHED.value,
                published_at=now,
                name=record.name,
                brand=record.brand,
                category=record.category.value,
                serving_size=record.product.get("serving_size"),
                ingredient_statement=record.ingredient_statement,
                normalized_data=normalized,
                field_provenance={
                    field: {
                        "source_record_id": str(source_record.id),
                        "source": source.slug,
                    }
                    for field in normalized
                },
            )
            session.add(revision)
            await session.flush()

            parsed = parse_off_ingredients(record.product)
            resolutions = await resolve_ingredients(
                session, [item.normalized_text for item in parsed]
            )
            await session.execute(
                delete(ProductIngredient).where(ProductIngredient.product_id == product.id)
            )
            match_count, unmatched = await self._write_ingredients(
                session, product, revision, parsed, resolutions
            )

            match_ratio = match_count / len(parsed) if parsed else 0.0
            images = record.images
            quality_score = round(
                0.25
                + (0.25 if has_ingredients else 0)
                + (0.30 * match_ratio)
                + (0.20 if any(image.asset_type == "front" for image in images) else 0),
                3,
            )
            revision.quality_score = quality_score
            product.data_quality_score = quality_score

            if unmatched:
                session.add(
                    QualityIssue(
                        product_revision_id=revision.id,
                        source_record_id=source_record.id,
                        ingestion_job_id=job.id,
                        code="unresolved_ingredients",
                        severity="warning",
                        field="ingredient_statement",
                        message=f"{len(unmatched)} ingredient occurrences need resolution",
                        details={"aliases": sorted(set(unmatched))[:100]},
                    )
                )
            if not parsed:
                session.add(
                    QualityIssue(
                        product_revision_id=revision.id,
                        source_record_id=source_record.id,
                        ingestion_job_id=job.id,
                        code="ingredient_parse_empty",
                        severity="warning",
                        field="ingredient_statement",
                        message="The source contains an ingredient statement but no occurrences were parsed",
                    )
                )

            asset_ids = await self._write_assets(
                session, product, revision, source_record, record
            )
            return ProductIngestionResult(
                product_id=product.id,
                source_record_id=source_record.id,
                asset_ids=tuple(asset_ids),
                revision_created=True,
            )

    async def _get_or_create_source(self, session: AsyncSession, info: SourceInfo) -> DataSource:
        source = (
            await session.execute(select(DataSource).where(DataSource.slug == info.slug))
        ).scalar_one_or_none()
        if source is None:
            source = DataSource(
                slug=info.slug,
                name=info.name,
                source_type="product_catalog",
                base_url=info.base_url,
                license_name=info.license_name,
                license_url=info.license_url,
                attribution_text=info.attribution,
                share_alike=info.share_alike,
                priority=info.priority,
            )
            session.add(source)
            await session.flush()
        return source

    async def _snapshot_source(
        self,
        session: AsyncSession,
        source: DataSource,
        record: OpenFoodFactsRecord,
    ) -> SourceRecord:
        content_hash = canonical_content_hash(record.product)
        snapshot = (
            await session.execute(
                select(SourceRecord).where(
                    SourceRecord.source_id == source.id,
                    SourceRecord.record_type == "product",
                    SourceRecord.external_id == record.barcode,
                    SourceRecord.content_hash == content_hash,
                )
            )
        ).scalar_one_or_none()
        if snapshot is None:
            snapshot = SourceRecord(
                source_id=source.id,
                external_id=record.barcode,
                record_type="product",
                schema_version=record.schema_version,
                request_url=record.request_url,
                http_etag=record.etag,
                content_hash=content_hash,
                payload=record.product,
                license_snapshot={
                    "name": source.license_name,
                    "url": source.license_url,
                    "attribution": source.attribution_text,
                    "share_alike": source.share_alike,
                },
            )
            session.add(snapshot)
            await session.flush()
        return snapshot

    async def _find_product(
        self, session: AsyncSession, barcode: str, gtin14: str
    ) -> Product | None:
        product = (
            await session.execute(
                select(Product)
                .join(ProductIdentifier, ProductIdentifier.product_id == Product.id)
                .where(
                    ProductIdentifier.scheme == "gtin",
                    ProductIdentifier.value == gtin14,
                    ProductIdentifier.market_country == "",
                )
            )
        ).scalar_one_or_none()
        if product is not None:
            return product
        candidates = {barcode, gtin14, gtin14.lstrip("0")}
        return (
            await session.execute(select(Product).where(Product.barcode.in_(candidates)))
        ).scalar_one_or_none()

    def _update_projection(
        self,
        product: Product,
        record: OpenFoodFactsRecord,
        normalized: dict,
        ingested_at: datetime,
    ) -> None:
        product.name = record.name
        product.brand = record.brand
        product.category = record.category.value
        serving_quantity = normalized.get("serving_quantity")
        product.serving_size = record.product.get("serving_size") or (
            f"{serving_quantity:g} g" if serving_quantity else None
        )
        product.publication_status = PublicationStatus.PUBLISHED.value
        product.last_ingested_at = ingested_at
        product.extra_data = {
            **(product.extra_data or {}),
            "source": record.source.slug,
            "nutriments": normalized.get("nutriments") or {},
            "serving_quantity": serving_quantity,
            "nutriscore_grade": normalized.get("nutriscore_grade"),
            "nova_group": normalized.get("nova_group"),
            "ingredients_text": normalized.get("ingredient_statement"),
            "quantity": normalized.get("quantity"),
        }

    async def _write_ingredients(
        self,
        session: AsyncSession,
        product: Product,
        revision: ProductRevision,
        parsed: list[ParsedIngredient],
        resolutions: dict[str, IngredientResolution],
    ) -> tuple[int, list[str]]:
        occurrence_by_path: dict[str, ProductIngredientOccurrence] = {}
        match_count = 0
        unmatched: list[str] = []
        for position, item in enumerate(parsed, start=1):
            resolution = resolutions.get(item.normalized_text)
            ingredient = resolution.ingredient if resolution else None
            if ingredient is not None:
                match_count += 1
            else:
                unmatched.append(item.normalized_text)
                statement = insert(UnmatchedIngredientLog).values(
                    name_raw=item.normalized_text[:500], count=1
                )
                await session.execute(
                    statement.on_conflict_do_update(
                        index_elements=[UnmatchedIngredientLog.name_raw],
                        set_={
                            "count": UnmatchedIngredientLog.count + 1,
                            "last_seen_at": func.now(),
                        },
                    )
                )

            parent = occurrence_by_path.get(item.parent_path or "")
            occurrence = ProductIngredientOccurrence(
                product_revision_id=revision.id,
                parent_id=parent.id if parent else None,
                ingredient_id=ingredient.id if ingredient else None,
                raw_text=item.raw_text,
                normalized_text=item.normalized_text,
                order_path=item.order_path,
                percentage=item.percentage,
                qualifiers=item.qualifiers,
                resolution_method=resolution.method if resolution else None,
                resolution_confidence=resolution.confidence if resolution else None,
            )
            session.add(occurrence)
            await session.flush()
            occurrence_by_path[item.order_path] = occurrence
            session.add(
                ProductIngredient(
                    product_id=product.id,
                    ingredient_id=ingredient.id if ingredient else None,
                    name=item.raw_text[:500],
                    status=_infer_status(ingredient),
                    percentage=item.percentage,
                    order_position=position,
                    note=(
                        f"Nested under {parent.raw_text}"
                        if parent is not None
                        else None
                    ),
                )
            )
        return match_count, unmatched

    async def _write_assets(
        self,
        session: AsyncSession,
        product: Product,
        revision: ProductRevision,
        source_record: SourceRecord,
        record: OpenFoodFactsRecord,
    ) -> list[UUID]:
        existing_assets = list(
            (
                await session.execute(
                    select(ProductAsset).where(
                        ProductAsset.product_revision_id == revision.id
                    )
                )
            ).scalars()
        )
        existing_by_url = {
            asset.source_url: asset
            for asset in existing_assets
            if asset.source_url
        }
        asset_ids: list[UUID] = [
            asset.id
            for asset in existing_assets
            if asset.verification_status == "pending"
        ]
        for image in record.images:
            existing = existing_by_url.get(image.url)
            if existing is not None:
                if image.asset_type == "front":
                    product.image_url = existing.public_url or image.url
                continue
            asset = ProductAsset(
                product_id=product.id,
                product_revision_id=revision.id,
                source_record_id=source_record.id,
                asset_type=image.asset_type[:30],
                role="primary" if image.asset_type == "front" else "evidence",
                language=image.language[:10],
                source_url=image.url,
                public_url=image.url,
                license_name=record.source.image_license_name or record.source.license_name,
                license_url=record.source.image_license_url or record.source.license_url,
                attribution_text=record.source.attribution,
                is_original=True,
                is_ai_generated=False,
                verification_status="pending",
            )
            session.add(asset)
            await session.flush()
            asset_ids.append(asset.id)
            existing_by_url[image.url] = asset
            if image.asset_type == "front":
                product.image_url = image.url
        return asset_ids


def _infer_status(ingredient: Ingredient | None) -> IngredientStatus:
    if ingredient is None:
        return IngredientStatus.WATCH
    if ingredient.category in {
        IngredientCategory.ADDITIVE,
        IngredientCategory.PRESERVATIVE,
        IngredientCategory.SWEETENER,
    } or ingredient.contraindications:
        return IngredientStatus.WATCH
    return IngredientStatus.CLEAN
