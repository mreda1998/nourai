"""Catalog index rows parsed from the Open Food Facts / Open Beauty Facts CSV dumps."""
from datetime import datetime, timezone

import pytest

from app.services.catalog.records import (
    iter_tsv,
    normalize_search_text,
    off_countries_to_iso,
    parse_off_row,
)
from app.services.ingestion.normalization import _check_digit


def with_check(body: str) -> str:
    """A barcode body plus its valid GS1 check digit."""
    return body + str(_check_digit(body))


def off_row(**overrides) -> dict[str, str]:
    row = {
        "code": "3017620422003",
        "product_name": "Nutella",
        "brands": "Ferrero,Nutella",
        "categories_tags": "en:spreads,en:sweet-spreads",
        "countries_tags": "en:france,en:united-states",
        "unique_scans_n": "1500",
        "completeness": "0.9",
        "last_modified_t": "1700000000",
        "image_url": "https://images.openfoodfacts.org/nutella.400.jpg",
        "image_small_url": "https://images.openfoodfacts.org/nutella.200.jpg",
        "additives_tags": "en:e322,en:e476",
    }
    row.update(overrides)
    return row


def test_search_text_is_lowercase_unaccented_unescaped_and_single_spaced():
    assert normalize_search_text("Café  Crème", "L&amp;Oréal") == "cafe creme l&oreal"
    assert normalize_search_text("Nutella", None) == "nutella"


def test_a_complete_off_row_becomes_a_catalog_row():
    row = parse_off_row(off_row(), default_category="food")
    assert row.external_id == "3017620422003"
    assert row.gtin14 == "03017620422003"
    assert row.name == "Nutella"
    assert row.brand == "Ferrero"
    assert row.category == "food"
    assert row.countries == ("FR", "US")
    assert row.popularity == 1500
    assert row.completeness == 0.9
    assert row.source_updated_at == datetime(2023, 11, 14, 22, 13, 20, tzinfo=timezone.utc)
    assert row.image_url.endswith("nutella.400.jpg")
    assert row.additives == ("en:e322", "en:e476")
    assert row.search_text == "nutella ferrero"


def test_supplement_categories_make_a_supplement():
    row = parse_off_row(off_row(categories_tags="en:dietary-supplements,en:vitamins"), default_category="food")
    assert row.category == "supplement"


def test_open_beauty_facts_rows_take_the_default_category():
    assert parse_off_row(off_row(), default_category="cosmetic").category == "cosmetic"


def test_html_entities_in_names_are_unescaped():
    assert parse_off_row(off_row(product_name="M&amp;M white"), default_category="food").name == "M&M white"


def test_missing_optional_fields_fall_back_cleanly():
    row = parse_off_row(
        off_row(unique_scans_n="", completeness="", last_modified_t="", image_url="", brands="", countries_tags="en:atlantis"),
        default_category="food",
    )
    assert row.popularity == 0
    assert row.completeness is None
    assert row.source_updated_at is None
    assert row.image_url.endswith("nutella.200.jpg")
    assert row.brand is None
    assert row.countries == ()


@pytest.mark.parametrize("code", [
    "3017620422004",                 # wrong check digit
    "000000000054",                  # placeholder / internal number
    with_check("200000000000"),      # EAN-13 in-store (GS1 prefix 2)
    with_check("023456789012"),      # restricted circulation 02x
    "not-a-code",
])
def test_unusable_barcodes_are_never_indexed(code):
    assert parse_off_row(off_row(code=code), default_category="food") is None


def test_rows_without_a_name_are_skipped():
    assert parse_off_row(off_row(product_name="   "), default_category="food") is None


def test_us_upc_codes_are_kept():
    assert parse_off_row(off_row(code="049000006346"), default_category="food").gtin14 == "00049000006346"


def test_content_hash_is_stable_and_tracks_changes():
    a = parse_off_row(off_row(), default_category="food")
    b = parse_off_row(off_row(), default_category="food")
    c = parse_off_row(off_row(product_name="Nutella B-ready"), default_category="food")
    assert a.content_hash == b.content_hash
    assert a.content_hash != c.content_hash


def test_off_country_tags_map_to_iso_codes():
    assert off_countries_to_iso("en:united-kingdom,en:germany,en:nowhere") == ("GB", "DE")


def test_iter_tsv_reads_columns_by_header_and_survives_huge_fields():
    huge = "x" * 200_000
    lines = [
        "product_name\tcode\tingredients_text\n",
        f"Nutella\t3017620422003\t{huge}\n",
    ]
    rows = list(iter_tsv(lines))
    assert rows[0]["code"] == "3017620422003"
    assert rows[0]["product_name"] == "Nutella"
    assert len(rows[0]["ingredients_text"]) == 200_000
