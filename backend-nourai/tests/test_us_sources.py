"""openFDA and USDA Branded: which listings count, how they map, and how lookups behave."""
import csv
import io
import json
import zipfile

import httpx
import pytest

from app.models.product import ProductCategory
from app.services.catalog.us_records import (
    iter_openfda_ndc, iter_usda_branded, parse_openfda_row, parse_usda_row,
)
from app.services.ingestion.connectors.base import SourceError, SourceNotFound, display_case
from app.services.ingestion.connectors.chain import ConnectorChain
from app.services.ingestion.connectors.openfda import (
    OPENFDA, OpenFDAConnector, _percent, is_personal_care, openfda_product,
)
from app.services.ingestion.connectors.openfoodfacts import OpenFoodFactsError, OpenFoodFactsRecord
from app.services.ingestion.connectors.usda_branded import USDA_BRANDED, USDABrandedConnector

pytestmark = pytest.mark.anyio

NEUTROGENA_UPC = "0086800103554"


def listing(*actives, route=("TOPICAL",), **extra):
    return {
        "product_type": "HUMAN OTC DRUG",
        "marketing_category": "OTC MONOGRAPH DRUG",
        "route": list(route),
        "brand_name": "Ultra Sheer Sunscreen SPF 60",
        "labeler_name": "KENVUE BRANDS LLC",
        "dosage_form": "LOTION",
        "active_ingredients": [{"name": name, "strength": strength} for name, strength in actives],
        "packaging": [{"description": "88 mL in 1 BOTTLE (69968-0829-2)"}],
        "openfda": {"upc": [NEUTROGENA_UPC]},
        **extra,
    }


SUNSCREEN = listing(("AVOBENZONE", "30 mg/mL"), ("HOMOSALATE", "135 mg/mL"))
LABEL = {"inactive_ingredient": ["Inactive ingredients Water, Glycerin, Dimethicone"]}


# ─── which listings are personal care ─────────────────────────────────────────

@pytest.mark.parametrize(
    ("product", "expected"),
    [
        (SUNSCREEN, True),
        (listing(("SODIUM FLUORIDE", "0.24 g/100g"), route=("DENTAL",)), True),
        (listing(("EUCALYPTOL", "0.92 mg/mL"), ("MENTHOL", "0.42 mg/mL"), ("THYMOL", "0.64 mg/mL"), route=("ORAL",)), True),
        (listing(("ALUMINUM ZIRCONIUM TETRACHLOROHYDREX GLY", "16 g/100g")), True),
        (listing(("IBUPROFEN", "200 mg/1")), False),
        (listing(("MENTHOL", "16 g/100g"), ("METHYL SALICYLATE", "30 g/100g")), False),  # a muscle rub
        (listing(("ZINC OXIDE", "20 g/100g"), ("LIDOCAINE", "4 g/100g")), False),
        (listing(("ZINC OXIDE", "20 g/100g"), route=("OPHTHALMIC",)), False),
        (listing(("ZINC OXIDE", "20 g/100g"), marketing_category="UNAPPROVED HOMEOPATHIC"), False),
        ({**SUNSCREEN, "product_type": "HUMAN PRESCRIPTION DRUG"}, False),
        (listing(), False),
    ],
)
def test_only_personal_care_listings_count(product, expected):
    assert is_personal_care(product) is expected


@pytest.mark.parametrize(
    ("strength", "percent"),
    [("30 mg/mL", 3.0), ("190.1 g/1000g", 19.01), ("3 g/100g", 3.0), ("60 mg/g", 6.0),
     ("900 g/1000g", None), ("200 mg/1", None), ("", None)],
)
def test_strengths_become_percentages_only_when_plausible(strength, percent):
    assert _percent(strength) == percent


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("TRADER JOE'S CHICKEN BREAST", "Trader Joe's Chicken Breast"),
        ("ANTI-DANDRUFF SHAMPOO SPF50", "Anti-Dandruff Shampoo SPF50"),
        ("SUNSCREEN SPF 30 (UVA/UVB)", "Sunscreen SPF 30 (UVA/UVB)"),
        ("Neutrogena Ultra Sheer", "Neutrogena Ultra Sheer"),
        (None, None),
    ],
)
def test_display_case_tames_all_caps_labels_only(text, expected):
    assert display_case(text) == expected


def test_an_openfda_listing_maps_to_a_cosmetic_with_actives_then_inactives():
    record = OpenFoodFactsRecord(
        barcode=NEUTROGENA_UPC, request_url="https://api.fda.gov/drug/ndc.json", schema_version="openfda-ndc",
        product=openfda_product(SUNSCREEN, LABEL), source=OPENFDA,
    )
    assert record.category == ProductCategory.COSMETIC
    assert record.name == "Ultra Sheer Sunscreen SPF 60"
    assert record.brand == "Kenvue Brands LLC"
    assert record.ingredient_statement == "Avobenzone 3%, Homosalate 13.5%, Water, Glycerin, Dimethicone"
    assert record.product["quantity"] == "88 mL"
    assert record.images == []


# ─── connectors ───────────────────────────────────────────────────────────────

def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_openfda_looks_up_both_upc_spellings_and_keeps_the_key_out_of_provenance():
    seen = []

    def handler(request):
        seen.append(request.url)
        endpoint = request.url.path.rsplit("/", 1)[-1]
        body = {"results": [SUNSCREEN if endpoint == "ndc.json" else LABEL]}
        return httpx.Response(200, json=body)

    async with _client(handler) as client:
        record = await OpenFDAConnector(client, api_key="secret").fetch_product("086800103554")
    assert record.source is OPENFDA
    assert record.ingredient_statement.endswith("Water, Glycerin, Dimethicone")
    assert '"0086800103554" "086800103554"' in seen[0].params["search"]
    assert seen[0].params["api_key"] == "secret"
    assert "secret" not in record.request_url


async def test_openfda_not_found_and_rate_limits_are_told_apart():
    async with _client(lambda request: httpx.Response(404, json={"error": {"code": "NOT_FOUND"}})) as client:
        with pytest.raises(SourceNotFound):
            await OpenFDAConnector(client, api_key="").fetch_product(NEUTROGENA_UPC)
    async with _client(lambda request: httpx.Response(429)) as client:
        with pytest.raises(SourceError) as raised:
            await OpenFDAConnector(client, api_key="").fetch_product(NEUTROGENA_UPC)
    assert not isinstance(raised.value, SourceNotFound)


def _food(fdc_id, gtin, published, **extra):
    return {
        "fdcId": fdc_id, "gtinUpc": gtin, "publishedDate": published, "description": "CHICKEN BREAST CHUNKS",
        "brandName": "MEIJER", "ingredients": "CHICKEN BREAST, WATER, SALT", "servingSize": 84.0,
        "servingSizeUnit": "GRM", "householdServingFullText": "3 oz", "brandedFoodCategory": "Poultry, Chicken & Turkey",
        "marketCountry": "United States",
        "foodNutrients": [{"nutrientId": 1003, "value": 14.3}, {"nutrientId": 1093, "value": 774}],
        **extra,
    }


async def test_usda_keeps_the_latest_revision_of_the_exact_gtin():
    bodies = []

    def handler(request):
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={"foods": [
            _food(1, "719283661364", "2021-01-01", description="OLD NAME"),
            _food(2, "00719283661364", "2023-09-14"),
            _food(3, "719283661365", "2025-01-01", description="A DIFFERENT PRODUCT"),
        ]})

    async with _client(handler) as client:
        record = await USDABrandedConnector(client, api_key="key").fetch_product("719283661364")
    assert bodies[0]["query"] == "gtinUpc:(00719283661364 OR 0719283661364 OR 719283661364)"
    assert record.source is USDA_BRANDED
    assert record.name == "Chicken Breast Chunks"
    assert record.brand == "Meijer"
    assert record.ingredient_statement == "Chicken breast, water, salt"
    assert record.nutriments == {"proteins_100g": 14.3, "sodium_100g": 0.774}
    assert record.serving_quantity == 84.0
    assert record.category == ProductCategory.FOOD
    assert record.request_url.endswith("/food-details/2/nutrients")


@pytest.mark.parametrize(("api_key", "barcode"), [("", "719283661364"), ("key", "000000000000")])
async def test_usda_without_a_key_or_with_a_placeholder_barcode_finds_nothing(api_key, barcode):
    def handler(request):
        raise AssertionError("no request expected")

    async with _client(handler) as client:
        with pytest.raises(SourceNotFound):
            await USDABrandedConnector(client, api_key=api_key).fetch_product(barcode)


class _Fake:
    def __init__(self, result):
        self.result, self.calls = result, 0

    async def fetch_product(self, barcode):
        self.calls += 1
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


async def test_the_chain_moves_on_only_when_a_source_has_no_record():
    found = OpenFoodFactsRecord(barcode="1", request_url="", schema_version="", product={}, source=OPENFDA)
    later = _Fake(found)
    assert await ConnectorChain([_Fake(SourceNotFound("off")), later]).fetch_product("1") is found

    untouched = _Fake(found)
    with pytest.raises(OpenFoodFactsError):
        await ConnectorChain([_Fake(OpenFoodFactsError("HTTP 429")), untouched]).fetch_product("1")
    assert untouched.calls == 0

    with pytest.raises(SourceNotFound, match="off; fda"):
        await ConnectorChain([_Fake(SourceNotFound("off")), _Fake(SourceNotFound("fda"))]).fetch_product("1")


# ─── dumps ────────────────────────────────────────────────────────────────────

def _zip(path, files):
    with zipfile.ZipFile(path, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return str(path)


def _csv(rows):
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    return out.getvalue()


def test_the_ndc_dump_yields_one_cosmetic_row_per_upc(tmp_path):
    two_upcs = {**SUNSCREEN, "openfda": {"upc": [NEUTROGENA_UPC, "0086800103561"]}}
    ibuprofen = listing(("IBUPROFEN", "200 mg/1"), route=("ORAL",))
    ended = {**SUNSCREEN, "marketing_end_date": "20240101", "openfda": {"upc": ["0086800103578"]}}
    path = _zip(tmp_path / "ndc.zip", {"drug-ndc.json": json.dumps({"results": [two_upcs, ibuprofen, ended]})})

    rows = [parse_openfda_row(item) for item in iter_openfda_ndc(path)]
    kept = [r for r in rows if r]
    assert len(rows) == 4
    assert [r.gtin14 for r in kept] == ["00086800103554", "00086800103561"]
    assert {(r.category, r.countries, r.brand) for r in kept} == {("cosmetic", ("US",), "Kenvue Brands LLC")}


def test_the_usda_dump_keeps_each_gtins_latest_live_revision(tmp_path):
    branded = [
        {"fdc_id": "1", "gtin_upc": "719283661364", "brand_name": "MEIJER", "brand_owner": "Meijer, Inc.",
         "branded_food_category": "Poultry, Chicken & Turkey", "market_country": "United States",
         "available_date": "2021-01-01", "discontinued_date": ""},
        {"fdc_id": "2", "gtin_upc": "00719283661364", "brand_name": "MEIJER", "brand_owner": "Meijer, Inc.",
         "branded_food_category": "Poultry, Chicken & Turkey", "market_country": "United States",
         "available_date": "2023-09-14", "discontinued_date": ""},
        # Submitted without its leading zero: still UPC-A 041303001233.
        {"fdc_id": "3", "gtin_upc": "41303001233", "brand_name": "", "brand_owner": "Sysco",
         "branded_food_category": "Vitamins & Supplements", "market_country": "US",
         "available_date": "2022-05-01", "discontinued_date": ""},
        {"fdc_id": "4", "gtin_upc": "036632001085", "brand_name": "GONE", "brand_owner": "",
         "branded_food_category": "Yogurt", "market_country": "United States",
         "available_date": "2024-01-01", "discontinued_date": "2025-01-01"},
        {"fdc_id": "5", "gtin_upc": "000000000000", "brand_name": "X", "brand_owner": "",
         "branded_food_category": "Candy", "market_country": "United States",
         "available_date": "2024-01-01", "discontinued_date": ""},
    ]
    food = [
        {"fdc_id": "1", "data_type": "branded_food", "description": "OLD CHICKEN"},
        {"fdc_id": "2", "data_type": "branded_food", "description": "CHICKEN BREAST CHUNKS"},
        {"fdc_id": "3", "data_type": "branded_food", "description": "Vitamin D3 Gummies"},
        {"fdc_id": "4", "data_type": "branded_food", "description": "GONE YOGURT"},
    ]
    path = _zip(tmp_path / "usda.zip", {"dump/branded_food.csv": _csv(branded), "dump/food.csv": _csv(food)})

    rows = [parse_usda_row(item) for item in iter_usda_branded(path)]
    assert [(r.gtin14, r.name, r.brand, r.category) for r in rows] == [
        ("00719283661364", "Chicken Breast Chunks", "Meijer", "food"),
        ("00041303001233", "Vitamin D3 Gummies", "Sysco", "supplement"),
    ]
    assert rows[0].countries == ("US",)
    assert rows[0].source_updated_at.year == 2023
