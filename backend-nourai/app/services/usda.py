"""
USDA FoodData Central service.

Provides search and detail retrieval for whole, unpackaged foods (salmon, broccoli,
eggs, etc.) that have no barcode and won't appear in Open Food Facts.

Free API key: https://fdc.nal.usda.gov/api-guide.html
Set USDA_API_KEY in the backend .env file.
"""
from __future__ import annotations

import httpx

from app.core.config import settings
from app.schemas.product import MobileIngredient

USDA_BASE = "https://api.nal.usda.gov/fdc/v1"

# Only Foundation and SR Legacy — these are whole/raw foods.
# Branded Food is excluded (OFF already covers packaged products).
_DATA_TYPES = "Foundation,SR Legacy"

# ─── Nutrient display config ──────────────────────────────────────────────────
# USDA returns values already in their native unit (G, MG, UG, KCAL).
# No conversion needed — just format and annotate with % DV.
#
# nutrientId → (display_name, daily_value_in_native_unit | None)

_NUTRIENT_META: dict[int, tuple[str, float | None]] = {
    1008: ("Calories",            None),    # KCAL
    1003: ("Protein",             50.0),    # G
    1004: ("Total Fat",           78.0),    # G
    1258: ("Saturated Fat",       20.0),    # G
    1005: ("Total Carbohydrates", 275.0),   # G
    1079: ("Dietary Fiber",       28.0),    # G
    2000: ("Sugars",              50.0),    # G
    1085: ("Sugars",              50.0),    # G  (alternate id — de-duped by name)
    1253: ("Cholesterol",         300.0),   # MG
    1093: ("Sodium",              2300.0),  # MG
    1092: ("Potassium",           4700.0),  # MG
    1106: ("Vitamin A",           900.0),   # UG RAE
    1162: ("Vitamin C",           90.0),    # MG
    1114: ("Vitamin D",           20.0),    # UG
    1109: ("Vitamin E",           15.0),    # MG
    1185: ("Vitamin K",           120.0),   # UG
    1178: ("Vitamin B12",         2.4),     # UG
    1170: ("Vitamin B6",          1.7),     # MG
    1167: ("Niacin",              16.0),    # MG
    1165: ("Thiamine",            1.2),     # MG
    1166: ("Riboflavin",          1.3),     # MG
    1175: ("Folate",              400.0),   # UG
    1168: ("Pantothenic Acid",    5.0),     # MG
    1087: ("Calcium",             1300.0),  # MG
    1089: ("Iron",                18.0),    # MG
    1090: ("Magnesium",           420.0),   # MG
    1091: ("Phosphorus",          1250.0),  # MG
    1095: ("Zinc",                11.0),    # MG
    1103: ("Selenium",            55.0),    # UG
    1404: ("Omega-3",             None),    # G
}

# Ordered list of nutrient IDs — macros first, then micros
_DISPLAY_ORDER: list[int] = [
    1008, 1003, 1004, 1258, 1005, 1079, 2000, 1085, 1253,
    1093, 1092,
    1106, 1162, 1114, 1109, 1185, 1178, 1170, 1167, 1165, 1166, 1175, 1168,
    1087, 1089, 1090, 1091, 1095, 1103, 1404,
]

_UNIT_SYMBOL: dict[str, str] = {
    "G": "g", "MG": "mg", "UG": "µg", "KCAL": "kcal",
}

# Mapping from USDA legacy nutrient number (string, as returned by the abridged
# endpoint) → FDC nutrient ID (int, as used in _NUTRIENT_META).
# The USDA abridged /food/{id} endpoint returns {"number": "203", "name": ...}
# instead of {"nutrientId": 1003, ...} that the search endpoint returns.
_LEGACY_NUMBER_TO_FDC: dict[str, int] = {
    "208": 1008,  # Energy (kcal)
    "203": 1003,  # Protein
    "204": 1004,  # Total Fat
    "606": 1258,  # Saturated Fat
    "205": 1005,  # Total Carbohydrates
    "291": 1079,  # Dietary Fiber
    "269": 2000,  # Sugars
    "601": 1253,  # Cholesterol
    "307": 1093,  # Sodium
    "306": 1092,  # Potassium
    "320": 1106,  # Vitamin A
    "401": 1162,  # Vitamin C
    "324": 1114,  # Vitamin D
    "328": 1114,  # Vitamin D (alternate)
    "323": 1109,  # Vitamin E
    "430": 1185,  # Vitamin K
    "418": 1178,  # Vitamin B12
    "415": 1170,  # Vitamin B6
    "406": 1167,  # Niacin
    "404": 1165,  # Thiamine
    "405": 1166,  # Riboflavin
    "417": 1175,  # Folate
    "410": 1168,  # Pantothenic Acid
    "301": 1087,  # Calcium
    "303": 1089,  # Iron
    "304": 1090,  # Magnesium
    "305": 1091,  # Phosphorus
    "309": 1095,  # Zinc
    "317": 1103,  # Selenium
    "621": 1404,  # Omega-3 DHA (approximate)
}

# ─── OFF nutriments fallback ──────────────────────────────────────────────────
# Maps USDA nutrientId → (OFF _100g key, factor_to_grams).
#
# OFF stores all nutriments in grams per 100g (kcal is the only exception — stored
# as kcal directly). USDA returns values in their native unit per 100g:
#   G   macros/fatty acids  → factor 1.0
#   MG  most minerals + B-vitamins, C, E  → factor 1/1_000
#   UG  fat-soluble vitamins A/D/K, B12, folate, selenium → factor 1/1_000_000
#   KCAL energy  → factor 1.0 (OFF also stores kcal as-is)
#
# Only nutrients that _parse_nutriments() in schemas/product.py already handles
# are included — anything else would be silently ignored at display time anyway.

_USDA_TO_OFF: dict[int, tuple[str, float]] = {
    # Energy & macros
    1008: ("energy-kcal",       1.0),
    1003: ("proteins",          1.0),
    1004: ("fat",               1.0),
    1258: ("saturated-fat",     1.0),
    1005: ("carbohydrates",     1.0),
    1079: ("fiber",             1.0),
    2000: ("sugars",            1.0),
    1085: ("sugars",            1.0),   # alternate sugar ID — de-duped on insert
    1253: ("cholesterol",       1 / 1_000),
    # Electrolytes & minerals
    1093: ("sodium",            1 / 1_000),
    1092: ("potassium",         1 / 1_000),
    1087: ("calcium",           1 / 1_000),
    1089: ("iron",              1 / 1_000),
    1090: ("magnesium",         1 / 1_000),
    1091: ("phosphorus",        1 / 1_000),
    1095: ("zinc",              1 / 1_000),
    1103: ("selenium",          1 / 1_000_000),
    # Fat-soluble vitamins
    1106: ("vitamin-a",         1 / 1_000_000),   # RAE µg  (note: USDA uses 1106, not 1104)
    1104: ("vitamin-a",         1 / 1_000_000),   # some datasets use 1104
    1114: ("vitamin-d",         1 / 1_000_000),
    1109: ("vitamin-e",         1 / 1_000),
    1185: ("vitamin-k",         1 / 1_000_000),
    # Water-soluble vitamins
    1162: ("vitamin-c",         1 / 1_000),
    1178: ("vitamin-b12",       1 / 1_000_000),
    1175: ("vitamin-b6",        1 / 1_000),
    1167: ("niacin",            1 / 1_000),
    1166: ("riboflavin",        1 / 1_000),
    1165: ("thiamin",           1 / 1_000),
    1177: ("folates",           1 / 1_000_000),   # DFE µg
    1170: ("pantothenic-acid",  1 / 1_000),
    # Fatty acids
    1404: ("omega-3-fat",       1.0),              # ALA g
}


def _is_nutriments_sparse(nutriments: dict) -> bool:
    """
    Return True when an OFF nutriments dict is missing the three core macros.
    Used to decide whether a USDA lookup fallback is worth attempting.
    """
    return not any(
        nutriments.get(k) for k in (
            "proteins_100g",      "proteins_serving",
            "fat_100g",           "fat_serving",
            "carbohydrates_100g", "carbohydrates_serving",
        )
    )


def _usda_food_to_off_nutriments(food: dict) -> dict[str, float]:
    """
    Convert a USDA food object (from the search endpoint's foodNutrients array)
    into an OFF-compatible nutriments dict with _100g keys, values in grams.
    """
    seen_off_keys: set[str] = set()
    nutriments: dict[str, float] = {}

    for nutrient in food.get("foodNutrients") or []:
        # Search endpoint shape: {"nutrientId": N, "value": V}
        nid   = nutrient.get("nutrientId")
        value = nutrient.get("value")
        if nid is None or value is None:
            continue

        mapping = _USDA_TO_OFF.get(nid)
        if mapping is None:
            continue

        off_key, factor = mapping
        if off_key in seen_off_keys:
            continue   # keep the first occurrence (e.g. sugars ID 2000 before 1085)

        converted = float(value) * factor
        if converted > 0:
            nutriments[f"{off_key}_100g"] = converted
            seen_off_keys.add(off_key)

    return nutriments


def _format_value(value: float, unit: str, dv: float | None) -> str:
    """Format a nutrient value string, e.g. '25 g (50% DV)'."""
    sym = _UNIT_SYMBOL.get(unit.upper(), unit.lower())

    if sym == "kcal":
        conc = f"{value:.0f} kcal"
    elif sym == "g":
        conc = f"{value:.0f} g" if value >= 10 else f"{value:.1f} g"
    elif sym == "mg":
        if value >= 10:
            conc = f"{value:.0f} mg"
        elif value >= 1:
            conc = f"{value:.1f} mg"
        else:
            conc = f"{value:.2f} mg"
    else:  # µg
        conc = f"{value:.1f} µg"

    if dv and value > 0:
        pct_dv = round((value / dv) * 100)
        if pct_dv > 0:
            conc += f" ({pct_dv}% DV)"

    return conc


def _build_nutrient_rows(food_nutrients: list[dict]) -> list[MobileIngredient]:
    """
    Convert a USDA foodNutrients array → MobileIngredient rows (is_nutrient=True).

    USDA delivers two shapes depending on endpoint format:
      abridged: {"nutrientId": N, "value": V, "unitName": U}
      full:     {"nutrient": {"id": N, "unitName": U}, "amount": V}
    We handle both.
    """
    lookup: dict[int, tuple[float, str]] = {}
    for fn in food_nutrients:
        # Support three response shapes:
        #   search endpoint:  {"nutrientId": N, "value": V, "unitName": U}
        #   full detail:      {"nutrient": {"id": N, "unitName": U}, "amount": V}
        #   abridged detail:  {"number": "N", "name": "...", "amount": V, "unitName": U}
        nid: int | None = None
        raw_nid = fn.get("nutrientId") or (fn.get("nutrient") or {}).get("id")
        if raw_nid is not None:
            try:
                nid = int(raw_nid)
            except (ValueError, TypeError):
                pass
        if nid is None:
            # Abridged detail endpoint uses legacy "number" field (string)
            legacy = fn.get("number")
            if legacy:
                nid = _LEGACY_NUMBER_TO_FDC.get(str(legacy))

        value = fn.get("value") if fn.get("value") is not None else fn.get("amount")
        unit = fn.get("unitName") or (fn.get("nutrient") or {}).get("unitName", "G")
        if nid is None or value is None:
            continue
        try:
            lookup[int(nid)] = (float(value), str(unit))
        except (ValueError, TypeError):
            continue

    results: list[MobileIngredient] = []
    seen_names: set[str] = set()

    for nid in _DISPLAY_ORDER:
        if nid not in lookup:
            continue
        meta = _NUTRIENT_META.get(nid)
        if not meta:
            continue

        display_name, dv = meta
        value, unit = lookup[nid]

        if value <= 0:
            continue
        if display_name in seen_names:   # de-dupe sugar / alternate IDs
            continue
        seen_names.add(display_name)

        results.append(MobileIngredient(
            name=display_name,
            concentration=_format_value(value, unit, dv),
            is_nutrient=True,
        ))

    return results


# ─── Service class ─────────────────────────────────────────────────────────────

class USDAService:
    """Thin async wrapper around the USDA FoodData Central REST API."""

    def __init__(self) -> None:
        self._api_key = settings.usda_api_key
        self.available = bool(self._api_key)

    def _params(self, **extra) -> dict:
        return {"api_key": self._api_key, **extra}

    async def search(self, query: str, limit: int = 10) -> list[dict]:
        """
        Search Foundation + SR Legacy foods.
        Returns ProductListItem-compatible dicts with id = 'usda-{fdcId}'.
        Returns [] if API key is not configured or network fails.
        """
        if not self.available:
            return []

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{USDA_BASE}/foods/search",
                    params=self._params(
                        query=query,
                        dataType=_DATA_TYPES,
                        pageSize=limit,
                    ),
                    timeout=8.0,
                )
                if resp.status_code != 200:
                    return []
                data = resp.json()
        except httpx.RequestError:
            return []

        results = []
        for food in data.get("foods") or []:
            fdc_id = food.get("fdcId")
            name = food.get("description") or "Unknown Food"
            if not fdc_id:
                continue
            results.append({
                "id": f"usda-{fdc_id}",
                "name": name.title(),
                "brand": None,
                "category": "food",
                "grade": "A",   # whole/raw foods default to A
                "is_ai_generated": False,
                "image_url": None,
            })

        return results

    async def fetch_nutriments(
        self,
        product_name: str,
        client: httpx.AsyncClient | None = None,
    ) -> dict[str, float] | None:
        """
        Search USDA for *product_name* and return a nutriments dict in OFF
        _100g format (values in grams), or None if nothing useful is found.

        Uses POST so the dataType array is sent as JSON — avoids URL-encoding
        issues with "SR Legacy" spaces and "Survey (FNDDS)" parentheses that
        cause 403s on USDA's WAF when sent as a GET query string.

        Raises RuntimeError on 401/403 so callers can abort early rather than
        silently counting every product as "not found".
        """
        if not self.available:
            return None

        body = {
            "query":    product_name,
            "dataType": ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
            "pageSize": 5,
        }
        url = f"{USDA_BASE}/foods/search?api_key={self._api_key}"

        _rank: dict[str, int] = {
            "Foundation": 0, "SR Legacy": 1, "Survey (FNDDS)": 2, "Branded": 3,
        }

        async def _do(c: httpx.AsyncClient) -> dict[str, float] | None:
            try:
                resp = await c.post(url, json=body, timeout=10.0)
            except httpx.RequestError as exc:
                print(f"    [USDA] Network error for '{product_name}': {exc}")
                return None

            if resp.status_code in (401, 403):
                raise RuntimeError(
                    f"USDA API key rejected (HTTP {resp.status_code}). "
                    "Check that USDA_API_KEY in .env is correct and that you have "
                    "verified your email at https://fdc.nal.usda.gov/api-guide.html"
                )
            if resp.status_code != 200:
                print(f"    [USDA] HTTP {resp.status_code} for '{product_name}'")
                return None

            foods: list[dict] = resp.json().get("foods") or []
            if not foods:
                return None

            best = min(
                foods,
                key=lambda f: _rank.get(f.get("dataType", "Branded"), 99),
            )
            nutriments = _usda_food_to_off_nutriments(best)
            return nutriments if nutriments else None

        if client is not None:
            return await _do(client)

        async with httpx.AsyncClient(
            headers={"User-Agent": "Elory/1.0 (nutrition-lookup)"},
        ) as c:
            return await _do(c)

    async def get_food(self, fdc_id: int | str) -> dict | None:
        """
        Fetch full nutritional detail for one USDA food.
        Returns a ProductWithDetails-compatible dict, or None on failure.
        """
        if not self.available:
            return None

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{USDA_BASE}/food/{fdc_id}",
                    params=self._params(format="abridged"),
                    timeout=8.0,
                )
                if resp.status_code != 200:
                    return None
                food = resp.json()
        except httpx.RequestError:
            return None

        food_nutrients = food.get("foodNutrients") or []
        nutrient_rows = _build_nutrient_rows(food_nutrients)

        name = (food.get("description") or "Unknown Food").title()
        data_type = food.get("dataType", "")
        tags = [data_type.replace(" ", "")] if data_type else []

        return {
            "id": f"usda-{fdc_id}",
            "barcode": None,
            "name": name,
            "brand": food.get("brandOwner") or None,
            "category": "food",
            "description": (
                f"Source: USDA FoodData Central · {data_type}. "
                "Values shown are per 100g unless a serving size is specified."
            ),
            "image_url": None,
            "grade": "A",
            "tags": tags,
            "has_allergen_warning": False,
            "allergen_warning": None,
            "is_ai_generated": False,
            "ingredients": [n.model_dump() for n in nutrient_rows],
            "bio_domains": [],
            "recommendations": [],
            "citations": [],
        }
