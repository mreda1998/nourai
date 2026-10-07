"""Read-only API for measurements from public laboratory datasets."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import DBSession
from app.models.laboratory import (
    LabAnalysis,
    LabDataset,
    LabInterpretation,
    LabObservation,
    LabSample,
)
from app.schemas.laboratory import (
    LabInterpretationResponse,
    LabObservationResponse,
    ProductLabResultsResponse,
)
from app.services.measures import measure_for_lab_observation


router = APIRouter()


@router.get("/products/{product_id}", response_model=ProductLabResultsResponse)
async def get_product_lab_results(
    product_id: UUID,
    db: DBSession,
    limit: int = Query(100, ge=1, le=500),
):
    """Return product/lot-specific measurements with complete source context."""
    rows = (
        await db.execute(
            select(LabObservation, LabAnalysis, LabSample, LabDataset)
            .join(LabAnalysis, LabAnalysis.id == LabObservation.analysis_id)
            .join(LabSample, LabSample.id == LabAnalysis.sample_id)
            .join(LabDataset, LabDataset.id == LabSample.dataset_id)
            .where(
                LabSample.product_id == product_id,
                LabDataset.status == "active",
            )
            .order_by(LabDataset.published_at.desc().nullslast(), LabObservation.analyte_name)
            .limit(limit)
        )
    ).all()
    observation_ids = [observation.id for observation, _, _, _ in rows]
    interpretations_by_observation: dict[UUID, list[LabInterpretationResponse]] = {}
    if observation_ids:
        interpretation_rows = await db.execute(
            select(LabInterpretation).where(
                LabInterpretation.observation_id.in_(observation_ids),
                LabInterpretation.active.is_(True),
            )
        )
        for item in interpretation_rows.scalars():
            interpretations_by_observation.setdefault(item.observation_id, []).append(
                LabInterpretationResponse(
                    classification=item.classification,
                    summary=item.summary,
                    jurisdiction=item.jurisdiction,
                    population_context=item.population_context,
                    threshold_name=item.threshold_name,
                    threshold_source_url=item.threshold_source_url,
                    threshold_version=item.threshold_version,
                    threshold_value=item.threshold_value,
                    threshold_unit=item.threshold_unit,
                )
            )

    observations = [
        LabObservationResponse(
            observation_id=observation.id,
            analyte_name=observation.analyte_name,
            value=observation.value,
            unit=observation.unit,
            basis=observation.basis,
            qualifier=observation.qualifier,
            raw_value=observation.raw_value,
            detection_status=observation.detection_status,
            lod=observation.lod,
            loq=observation.loq,
            uncertainty=observation.uncertainty,
            uncertainty_unit=observation.uncertainty_unit,
            method_name=analysis.method_name,
            laboratory_name=analysis.laboratory_name,
            analyzed_at=analysis.analyzed_at,
            sample_external_id=sample.external_id,
            sample_name=sample.sample_name,
            lot_number=sample.lot_number,
            dataset_title=dataset.title,
            publisher=dataset.publisher,
            source_url=dataset.source_url,
            dataset_version=dataset.version,
            license_name=dataset.license_name,
            applicability=dataset.applicability,
            trust_grade=dataset.trust_grade,
            interpretations=interpretations_by_observation.get(observation.id, []),
            measure=measure_for_lab_observation(
                observation, interpretations_by_observation.get(observation.id, [])
            ),
        )
        for observation, analysis, sample, dataset in rows
    ]
    return ProductLabResultsResponse(product_id=product_id, observations=observations)
