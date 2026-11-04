"""The golden set is well formed: real vocabularies, official https sources, quotes once approved."""
import json
from pathlib import Path

from app.core.regulation import CATEGORY_SCOPES, LAW_STATUSES, PLACES, SCOPES

GOLDEN = json.loads((Path(__file__).parents[1] / "data" / "regulation" / "golden_set.json").read_text())


def test_entries_use_the_vocabularies_and_official_sources():
    assert len(GOLDEN) >= 20
    for entry in GOLDEN:
        assert entry["expect"], entry["substance"]
        for item in entry["expect"]:
            assert item["place"] in PLACES, entry["substance"]
            assert item["applies_to"] in SCOPES, entry["substance"]
            assert item["status"] in LAW_STATUSES, entry["substance"]
            assert item["source_url"].startswith("https://"), entry["substance"]
            if entry["approved_by"]:
                assert item["quote"], f"{entry['substance']}: approved entries carry the source quote"
        if entry["product_note"]:
            assert entry["product_note"]["category"] in CATEGORY_SCOPES
