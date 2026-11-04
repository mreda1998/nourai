"""
openFDA connector: US personal care sold as over-the-counter drugs — sunscreen,
toothpaste and mouthwash, antiperspirant, acne and dandruff care, skin
protectants, hand sanitiser — found by the UPC on the drug listing. Public domain.

The NDC directory gives the name, labeler and active ingredients with their
strengths; the drug label adds the inactive ingredients. Medicines (pain,
cold, allergy) are left out: a product counts only when every active is a
personal-care active.
"""
from __future__ import annotations

import re
from typing import Any

import httpx

from app.core.config import settings
from app.services.ingestion.connectors.base import SourceError, SourceInfo, SourceNotFound, display_case
from app.services.ingestion.connectors.openfoodfacts import OpenFoodFactsRecord
from app.services.ingestion.normalization import normalize_gtin

OPENFDA = SourceInfo(
    slug="openfda",
    name="openFDA",
    base_url="https://open.fda.gov",
    license_name="Public Domain (CC0 1.0)",
    license_url="https://open.fda.gov/license/",
    attribution="U.S. Food and Drug Administration, openFDA",
    share_alike=False,
    priority=65,
)

_API = "https://api.fda.gov/drug"

# Actives that make a product personal care rather than medicine. Prefixes, so
# every aluminium-zirconium antiperspirant salt and "DIMETHICONE, UNSPECIFIED" match.
_PERSONAL_CARE_ACTIVES = (
    # sunscreen filters
    "ZINC OXIDE", "TITANIUM DIOXIDE", "AVOBENZONE", "OCTISALATE", "OCTOCRYLENE", "HOMOSALATE",
    "OCTINOXATE", "OXYBENZONE", "ENSULIZOLE", "ETHYLHEXYL SALICYLATE", "OCTYL SALICYLATE",
    "SULISOBENZONE", "DIOXYBENZONE", "MERADIMATE", "PADIMATE O", "CINOXATE", "ECAMSULE",
    # antiperspirant
    "ALUMINUM CHLOROHYDR", "ALUMINUM SESQUICHLOROHYDR", "ALUMINUM ZIRCONIUM", "ALUMINUM CHLORIDE",
    # toothpaste and mouthwash
    "SODIUM FLUORIDE", "STANNOUS FLUORIDE", "SODIUM MONOFLUOROPHOSPHATE", "POTASSIUM NITRATE",
    "CETYLPYRIDINIUM CHLORIDE", "EUCALYPTOL", "THYMOL",
    # acne and scalp
    "SALICYLIC ACID", "BENZOYL PEROXIDE", "ADAPALENE", "SULFUR", "RESORCINOL",
    "PYRITHIONE ZINC", "SELENIUM SULFIDE", "COAL TAR",
    # skin protectants and moisturisers
    "DIMETHICONE", "PETROLATUM", "WHITE PETROLATUM", "GLYCERIN", "OATMEAL", "COLLOIDAL OATMEAL",
    "ALLANTOIN", "MINERAL OIL", "LIGHT MINERAL OIL", "COCOA BUTTER", "SHEA BUTTER", "LANOLIN",
    # hand sanitiser and antibacterial soap
    "ALCOHOL", "ETHYL ALCOHOL", "ISOPROPYL ALCOHOL", "BENZALKONIUM CHLORIDE", "BENZETHONIUM CHLORIDE",
    "CHLOROXYLENOL", "TRICLOSAN",
    # anti-wrinkle and brightening, listed as drugs by Korean brands
    "ADENOSINE", "NIACINAMIDE", "ARBUTIN",
)
# Also in medicines (rubs, cold-sore and first-aid products); fine beside a
# personal-care active, as in mouthwash, but not on their own.
_SHARED_ACTIVES = ("MENTHOL", "LEVOMENTHOL", "METHYL SALICYLATE", "CAMPHOR", "WITCH HAZEL", "HYDROGEN PEROXIDE")
# Routes a cosmetic can take; eye drops, nasal sprays and the like are medicine.
_ROUTES = frozenset({"TOPICAL", "CUTANEOUS", "DENTAL", "ORAL", "BUCCAL", "PERIODONTAL"})


def is_personal_care(ndc: dict[str, Any]) -> bool:
    """An OTC listing that is personal care: every active a personal-care one, on a cosmetic route."""
    if ndc.get("product_type") != "HUMAN OTC DRUG":
        return False
    if "HOMEOPATHIC" in (ndc.get("marketing_category") or ""):
        return False
    routes = set(ndc.get("route") or [])
    if not routes or not routes <= _ROUTES:
        return False
    actives = [str(a.get("name") or "").upper() for a in ndc.get("active_ingredients") or []]
    if not actives:
        return False
    core = [name for name in actives if name.startswith(_PERSONAL_CARE_ACTIVES)]
    shared = [name for name in actives if name.startswith(_SHARED_ACTIVES)]
    return bool(core) and len(core) + len(shared) == len(actives)


def upc_variants(barcode: str) -> list[str]:
    """The spellings openFDA may store a UPC under: 12-digit UPC-A or 13-digit EAN."""
    gtin14 = normalize_gtin(barcode).gtin14
    if len(gtin14.lstrip("0")) < 6:
        raise ValueError("placeholder barcode")
    variants = [gtin14[1:]]
    if gtin14.startswith("00"):
        variants.append(gtin14[2:])
    return variants


def openfda_product(ndc: dict[str, Any], label: dict[str, Any] | None) -> dict[str, Any]:
    """An NDC listing (plus its label, when found) in Open Food Facts' product shape."""
    name = " ".join(part for part in (ndc.get("brand_name"), ndc.get("brand_name_suffix")) if part)
    actives = [_active_text(active) for active in ndc.get("active_ingredients") or []]
    inactive = _inactive_text(label)
    statement = ", ".join([*actives, *([inactive] if inactive else [])])
    packaging = [p.get("description") for p in ndc.get("packaging") or [] if p.get("description")]
    return {
        "product_name": display_case(name.strip()) or display_case(ndc.get("generic_name")),
        "generic_name": display_case(ndc.get("generic_name")),
        "brands": display_case(ndc.get("labeler_name")),
        "product_type": "beauty" if is_personal_care(ndc) else "medicine",
        "categories": ", ".join(filter(None, [ndc.get("dosage_form"), *ndc.get("route", [])])),
        "ingredients_text": statement or None,
        "quantity": _quantity(packaging[0]) if packaging else None,
        "countries_tags": ["en:united-states"],
        "product_ndc": ndc.get("product_ndc"),
        "labeler_name": ndc.get("labeler_name"),
    }


class OpenFDAConnector:
    source = OPENFDA

    def __init__(self, client: httpx.AsyncClient | None = None, api_key: str | None = None) -> None:
        self._client = client
        self._api_key = settings.openfda_api_key if api_key is None else api_key

    async def fetch_product(self, barcode: str) -> OpenFoodFactsRecord:
        try:
            variants = upc_variants(barcode)
        except ValueError as exc:
            raise SourceNotFound(f"openFDA can't look up {barcode!r}: {exc}") from exc
        # Space-separated terms are OR'd; a literal "+" would mean "required".
        search = "openfda.upc:(" + " ".join(f'"{upc}"' for upc in variants) + ")"
        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=httpx.Timeout(10.0))
        try:
            ndc, url = await self._first(client, "ndc", search)
            if ndc is None:
                raise SourceNotFound(f"No openFDA listing for {barcode}")
            label, _ = await self._first(client, "label", search)
        finally:
            if owns_client:
                await client.aclose()
        return OpenFoodFactsRecord(
            barcode=barcode,
            request_url=url,
            schema_version="openfda-ndc",
            product=openfda_product(ndc, label),
            source=OPENFDA,
        )

    async def _first(self, client: httpx.AsyncClient, endpoint: str, search: str) -> tuple[dict | None, str]:
        params = {"search": search, "limit": "1"}
        if self._api_key:
            params["api_key"] = self._api_key
        try:
            response = await client.get(f"{_API}/{endpoint}.json", params=params)
        except httpx.RequestError as exc:
            raise SourceError(f"openFDA request failed: {exc}") from exc
        # The request URL is kept as provenance, so it must not carry the key.
        url = str(response.request.url.copy_remove_param("api_key"))
        if response.status_code == 404:
            return None, url
        if response.status_code != 200:
            raise SourceError(f"openFDA returned HTTP {response.status_code}")
        try:
            results = response.json().get("results") or []
        except ValueError as exc:
            raise SourceError("openFDA returned invalid JSON") from exc
        return (results[0] if results else None), url


_INACTIVE_HEADING = re.compile(r"^\s*inactive\s+ingredients?\s*[:.\-]?\s*", re.IGNORECASE)
_STRENGTH = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(mg|g)\s*/\s*(\d+(?:\.\d+)?)?\s*(ml|g|mL)\s*$", re.IGNORECASE)
_QUANTITY = re.compile(r"^\s*(\d+(?:\.\d+)?\s*(?:mL|L|g|kg|oz|fl oz))\b", re.IGNORECASE)


def _active_text(active: dict[str, Any]) -> str:
    name = display_case(str(active.get("name") or "").strip()) or ""
    percent = _percent(str(active.get("strength") or ""))
    # The ingredient parser reads "Avobenzone 3%", not "Avobenzone (3%)".
    return f"{name} {percent:g}%" if percent is not None else name


def _percent(strength: str) -> float | None:
    """ "30 mg/mL", "190.1 g/1000g", "3 g/100g" → a percentage, when the listing makes sense."""
    match = _STRENGTH.match(strength)
    if not match:
        return None
    amount, unit, per, _ = match.groups()
    grams = float(amount) / (1000 if unit.lower() == "mg" else 1)
    percent = 100 * grams / float(per or 1)
    # Listings carry typos ("900 g/1000g" zinc oxide); leave those unstated.
    return round(percent, 3) if 0 < percent <= 50 else None


def _inactive_text(label: dict[str, Any] | None) -> str | None:
    sections = (label or {}).get("inactive_ingredient") or []
    text = " ".join(str(section) for section in sections).strip()
    text = _INACTIVE_HEADING.sub("", text).strip().rstrip(".")
    return display_case(text) or None


def _quantity(description: str) -> str | None:
    match = _QUANTITY.match(description)
    return match.group(1) if match else None
