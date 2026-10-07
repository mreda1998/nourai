"""Catalog search only runs for queries the trigram index can serve."""
import pytest

from app.repositories.catalog import catalog_query_ok


@pytest.mark.parametrize("query, ok", [
    ("ab", False), ("m&", False), ("   ", False), ("m&m's", False), ("nut", True), ("oat milk", True), ("CAFÉ", True),
])
def test_catalog_queries_need_an_indexable_word(query, ok):
    assert catalog_query_ok(query) is ok
