"""Strict importer for licensed, publicly published laboratory datasets."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingestion import DataSource, ProductIdentifier
from app.models.laboratory import (
    LabAnalysis,
    LabDataset,
    LabInterpretation,
    LabObservation,
    LabSample,
)
from app.schemas.laboratory import LabDatasetImport
from app.services.ingestion.normalization import (
    canonical_content_hash,
    normalize_gtin,
    normalize_ingredient_alias,
)
from app.services.ingestion.resolver import resolve_ingredients


@dataclass(frozen=True, slots=True)
class LabImportResult:
    dataset_id: str
    samples: int
    observations: int
    matched_products: int
    matched_analytes: int


async def import_lab_dataset(
    session: AsyncSession,
    manifest: LabDatasetImport,
    *,
    raw_asset_uri: str | None = None,
) -> LabImportResult:
    """Import one immutable dataset version; never fuzzy-match products/analytes."""
    serialized = manifest.model_dump(mode="json")
    content_hash = canonical_content_hash(serialized)
    existing = (
        await session.execute(
            select(LabDataset).where(LabDataset.slug == manifest.slug)
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.content_hash != content_hash:
            raise ValueError(
                "This dataset slug already exists with different content; use a new versioned slug"
            )
        counts = _manifest_counts(manifest)
        return LabImportResult(str(existing.id), *counts, 0, 0)

    source_slug = f"published-lab-{hashlib.sha256(manifest.source_url.encode()).hexdigest()[:16]}"
    source = (
        await session.execute(select(DataSource).where(DataSource.slug == source_slug))
    ).scalar_one_or_none()
    if source is None:
        source = DataSource(
            slug=source_slug,
            name=manifest.publisher,
            source_type="laboratory",
            base_url=manifest.source_url,
            license_name=manifest.license_name,
            license_url=manifest.license_url,
            attribution_text=f"Laboratory results published by {manifest.publisher}",
            priority=40,
        )
        session.add(source)
        await session.flush()

    dataset = LabDataset(
        source_id=source.id,
        slug=manifest.slug,
        title=manifest.title,
        publisher=manifest.publisher,
        source_url=manifest.source_url,
        version=manifest.version,
        published_at=manifest.published_at,
        license_name=manifest.license_name,
        license_url=manifest.license_url,
        content_hash=content_hash,
        raw_asset_uri=raw_asset_uri,
        applicability=manifest.applicability,
        trust_grade=manifest.trust_grade,
        metadata_json=manifest.metadata,
    )
    session.add(dataset)
    await session.flush()

    analyte_names = [
        observation.analyte_name
        for sample in manifest.samples
        for analysis in sample.analyses
        for observation in analysis.observations
    ]
    analyte_resolutions = await resolve_ingredients(session, analyte_names)
    observations_count = 0
    matched_products = 0
    matched_analytes = 0

    for sample_input in manifest.samples:
        product_id = None
        gtin14 = None
        match_method = None
        match_confidence = None
        if sample_input.gtin:
            normalized = normalize_gtin(sample_input.gtin)
            gtin14 = normalized.gtin14
            identifier = (
                await session.execute(
                    select(ProductIdentifier).where(
                        ProductIdentifier.scheme == "gtin",
                        ProductIdentifier.value == gtin14,
                        ProductIdentifier.market_country == "",
                    )
                )
            ).scalar_one_or_none()
            if identifier is not None:
                product_id = identifier.product_id
                match_method = "gtin_exact"
                match_confidence = 1.0
                matched_products += 1

        sample = LabSample(
            dataset_id=dataset.id,
            external_id=sample_input.external_id,
            product_id=product_id,
            product_match_method=match_method,
            product_match_confidence=match_confidence,
            sample_name=sample_input.sample_name,
            matrix=sample_input.matrix,
            gtin=gtin14,
            lot_number=sample_input.lot_number,
            market_country=sample_input.market_country.upper(),
            purchase_location=sample_input.purchase_location,
            purchased_at=sample_input.purchased_at,
            expiration_date=sample_input.expiration_date,
            preparation=sample_input.preparation,
            is_composite=sample_input.is_composite,
            sample_metadata=sample_input.metadata,
        )
        session.add(sample)
        await session.flush()

        for analysis_input in sample_input.analyses:
            analysis = LabAnalysis(
                sample_id=sample.id,
                laboratory_name=analysis_input.laboratory_name,
                accreditation=analysis_input.accreditation,
                accreditation_scope=analysis_input.accreditation_scope,
                method_name=analysis_input.method_name,
                method_identifier=analysis_input.method_identifier,
                instrument=analysis_input.instrument,
                analyzed_at=analysis_input.analyzed_at,
                batch_identifier=analysis_input.batch_identifier,
                replicate_count=analysis_input.replicate_count,
                quality_control=analysis_input.quality_control,
            )
            session.add(analysis)
            await session.flush()
            for observation_input in analysis_input.observations:
                resolution = analyte_resolutions.get(
                    normalize_ingredient_alias(observation_input.analyte_name)
                )
                ingredient = resolution.ingredient if resolution else None
                if ingredient is not None:
                    matched_analytes += 1
                observation = LabObservation(
                    analysis_id=analysis.id,
                    analyte_ingredient_id=ingredient.id if ingredient else None,
                    analyte_name=observation_input.analyte_name,
                    analyte_identifier_scheme=observation_input.identifier_scheme,
                    analyte_identifier_value=observation_input.identifier_value,
                    value=observation_input.value,
                    unit=observation_input.unit,
                    basis=observation_input.basis,
                    qualifier=observation_input.qualifier,
                    detection_status=observation_input.detection_status,
                    lod=observation_input.lod,
                    loq=observation_input.loq,
                    uncertainty=observation_input.uncertainty,
                    uncertainty_unit=observation_input.uncertainty_unit,
                    raw_value=observation_input.raw_value,
                    observation_metadata=observation_input.metadata,
                )
                session.add(observation)
                await session.flush()
                observations_count += 1
                for interpretation_input in observation_input.interpretations:
                    session.add(
                        LabInterpretation(
                            observation_id=observation.id,
                            classification=interpretation_input.classification,
                            summary=interpretation_input.summary,
                            jurisdiction=interpretation_input.jurisdiction,
                            population_context=interpretation_input.population_context,
                            threshold_name=interpretation_input.threshold_name,
                            threshold_source_url=interpretation_input.threshold_source_url,
                            threshold_version=interpretation_input.threshold_version,
                            threshold_value=interpretation_input.threshold_value,
                            threshold_unit=interpretation_input.threshold_unit,
                            interpretation_version=interpretation_input.interpretation_version,
                        )
                    )

    return LabImportResult(
        dataset_id=str(dataset.id),
        samples=len(manifest.samples),
        observations=observations_count,
        matched_products=matched_products,
        matched_analytes=matched_analytes,
    )


def _manifest_counts(manifest: LabDatasetImport) -> tuple[int, int]:
    observations = sum(
        len(analysis.observations)
        for sample in manifest.samples
        for analysis in sample.analyses
    )
    return len(manifest.samples), observations
