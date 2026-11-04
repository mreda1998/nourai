"""Look a barcode up in each source in turn; the first that holds it answers."""
from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

from app.services.ingestion.connectors.base import SourceNotFound
from app.services.ingestion.connectors.openfda import OpenFDAConnector
from app.services.ingestion.connectors.openfoodfacts import OpenFoodFactsConnector, OpenFoodFactsRecord
from app.services.ingestion.connectors.usda_branded import USDABrandedConnector


class ProductConnector(Protocol):
    async def fetch_product(self, barcode: str) -> OpenFoodFactsRecord: ...


class ConnectorChain:
    """Only "not found" moves on to the next source. Any other failure (a rate limit,
    an outage) stops the lookup so the job retries, rather than letting a lesser
    source stand in for a product the first one holds."""

    def __init__(self, connectors: Sequence[ProductConnector]) -> None:
        self._connectors = tuple(connectors)

    async def fetch_product(self, barcode: str) -> OpenFoodFactsRecord:
        misses: list[str] = []
        for connector in self._connectors:
            try:
                return await connector.fetch_product(barcode)
            except SourceNotFound as exc:
                misses.append(str(exc))
        raise SourceNotFound("; ".join(misses) or f"No source holds {barcode}")


def default_connector() -> ConnectorChain:
    # Open Food Facts first: it holds most products, with photos and nutrition.
    return ConnectorChain([OpenFoodFactsConnector(), OpenFDAConnector(), USDABrandedConnector()])
