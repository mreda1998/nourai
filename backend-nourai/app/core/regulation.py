"""Fixed vocabularies for ingredient rules: statuses, places, product scopes and their wording.

Laws and expert views never share wording: expert bodies get their own classification label, never
"banned" or "allowed".
"""

# Severity order, most severe first. The first four flag a product row.
LAW_STATUSES: tuple[str, ...] = (
    "banned",
    "not_authorised",
    "prescription_only",
    "warning_label",
    "approval_required",
    "listed",
    "allowed_with_limits",
    "allowed",
)
FLAG_STATUSES: tuple[str, ...] = ("banned", "not_authorised", "prescription_only", "warning_label")

STATUS_LABELS: dict[str, str] = {
    "banned": "Banned",
    "not_authorised": "Not authorised",
    "prescription_only": "Prescription only",
    "approval_required": "Approval required",
    "warning_label": "Warning label required",
    "allowed_with_limits": "Allowed with limits",
    "allowed": "Allowed",
    "listed": "Listed",
}

SCOPES: tuple[str, ...] = ("food_additive", "food", "supplement", "cosmetic", "medicine", "sport")

SCOPE_PHRASES: dict[str, str] = {
    "food_additive": "as a food additive",
    "food": "in food",
    "supplement": "in supplements",
    "cosmetic": "in cosmetics",
    "medicine": "as a medicine",
    "sport": "in sport",
}

# Which scopes apply to a product, by its category. In the EU supplements are foods, so food
# additive rules reach supplement coatings.
CATEGORY_SCOPES: dict[str, tuple[str, ...]] = {
    "food": ("food", "food_additive"),
    "supplement": ("supplement", "food_additive", "sport"),
    "cosmetic": ("cosmetic",),
    "otc": ("medicine", "cosmetic"),
}

PLACES: tuple[str, ...] = ("EU", "FR", "DE", "IT", "GB", "CA", "US", "US-CA", "AU", "NZ", "WADA")
EXPERT_BODIES: tuple[str, ...] = ("IARC", "JECFA", "EFSA")

EU_MEMBERS: frozenset[str] = frozenset({
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
    "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
})

PLACE_NAMES: dict[str, str] = {
    "EU": "European Union",
    "FR": "France",
    "DE": "Germany",
    "IT": "Italy",
    "GB": "United Kingdom",
    "CA": "Canada",
    "US": "United States",
    "US-CA": "California",
    "AU": "Australia",
    "NZ": "New Zealand",
    "WADA": "Sport (WADA)",
    "IARC": "IARC (WHO cancer agency)",
    "JECFA": "JECFA (FAO/WHO additives committee)",
    "EFSA": "EFSA (EU food safety agency)",
    "AT": "Austria", "BE": "Belgium", "BG": "Bulgaria", "CY": "Cyprus", "CZ": "Czechia",
    "DK": "Denmark", "EE": "Estonia", "ES": "Spain", "FI": "Finland", "GR": "Greece", "HR": "Croatia",
    "HU": "Hungary", "IE": "Ireland", "LT": "Lithuania", "LU": "Luxembourg", "LV": "Latvia",
    "MT": "Malta", "NL": "Netherlands", "PL": "Poland", "PT": "Portugal", "RO": "Romania",
    "SE": "Sweden", "SI": "Slovenia", "SK": "Slovakia",
}

_PHRASE_OVERRIDES = {"EU": "the EU", "US": "the US", "GB": "the UK", "NL": "the Netherlands",
                     "WADA": "sport (WADA)"}
PLACE_PHRASES: dict[str, str] = {code: _PHRASE_OVERRIDES.get(code, name) for code, name in PLACE_NAMES.items()}

DEFAULT_COUNTRY = "CA"


def normalize_country(raw: str | None) -> str:
    """An uppercase two-letter country code; anything else falls back to the launch market."""
    code = (raw or "").strip().upper()
    return code if len(code) == 2 and code.isalpha() else DEFAULT_COUNTRY


def own_places(country: str) -> tuple[str, ...]:
    """The places whose rules apply where this person lives, most specific first."""
    if country in EU_MEMBERS:
        return (country, "EU")
    if country == "US":
        return ("US", "US-CA")
    if country in PLACES:
        return (country,)
    return ()
