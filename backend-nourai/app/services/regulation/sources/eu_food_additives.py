"""The EU Union list of food additives (Regulation (EC) No 1333/2008, Annex II), with Annex V warnings.

Source (verified 2026-11-04): the European Commission's Food and Feed Information Portal, the backend
behind https://ec.europa.eu/food/food-feed-portal/screen/food-additives/search —
`backend/api/policy-items?foodDomain=fin&authorisationType=fad_auth` (every authorisation, JSON) and
`backend/api/food_categories?domain_code=fad` (category names). Both are fetched and bundled as one
JSON document. Licence: Commission reuse policy, Decision 2011/833/EU.

A positive list: only listed additives may be used, and only in their listed food categories. An entry
with no food category (titanium dioxide since Regulation (EU) 2022/63) is not authorised in food.
The six "Southampton" colours also need a label warning (Article 24 and Annex V).
"""
from __future__ import annotations

import json
import re

import httpx

from app.services.regulation.identifiers import normalize_e_number
from app.services.regulation.importer import ParsedList, ParsedRule, ParsedSubstance, register

API = "https://ec.europa.eu/food/food-feed-portal/backend/api"
ITEMS_URL = f"{API}/policy-items?foodDomain=fin&authorisationType=fad_auth"
CATEGORIES_URL = f"{API}/food_categories?domain_code=fad"
DETAILS_URL = "https://ec.europa.eu/food/food-feed-portal/screen/food-additives/search/details/{code}"
REGULATION_URL = "https://eur-lex.europa.eu/eli/reg/2008/1333/oj"
AUTHORITY = "European Commission"
LEGAL_BASIS = (
    "Only food additives included in the Union list in Annex II may be placed on the market as such and "
    "used in foods under the conditions of use specified therein."
)
# Annex V: colours whose foods must carry the hyperactivity warning.
ANNEX_V = {"E110", "E104", "E122", "E129", "E102", "E124"}
ANNEX_V_WARNING = (
    'The label must say: "[name or E number of the colour(s)]: may have an adverse effect on activity '
    'and attention in children." Not required on drinks with more than 1.2% alcohol, or for health '
    "marking on meat or decorative colouring of eggshells."
)
UNITS = {"FAD_RU_MGK": "mg/kg", "FAD_RU_MGL": "mg/l"}
_SPACE = re.compile(r"\s+")


def _walk(node: dict):
    yield node
    for child in node.get("childrenValues") or []:
        yield from _walk(child)


def _value(node: dict, key: str) -> str | None:
    for item in _walk(node):
        if item.get("valueIdentifier") == key and item.get("value") not in (None, ""):
            return _SPACE.sub(" ", str(item["value"])).strip()
    return None


def _values(node: dict, key: str) -> list[str]:
    return [_SPACE.sub(" ", str(i["value"])).strip() for i in _walk(node)
            if i.get("valueIdentifier") == key and i.get("value") not in (None, "")]


def _children(node: dict, key: str) -> list[dict]:
    return [i for i in _walk(node) if i.get("valueIdentifier") == key]


class EuFoodAdditives:
    slug = "eu-food-additives"
    name = "EU Union list of food additives (Regulation (EC) No 1333/2008, Annex II)"
    licence_name = "Commission reuse policy (Decision 2011/833/EU)"
    licence_url = "https://eur-lex.europa.eu/eli/dec/2011/833/oj"
    default_url = ITEMS_URL

    async def fetch(self, client: httpx.AsyncClient) -> bytes:
        headers = {"Accept": "application/json"}
        items = (await client.get(ITEMS_URL, headers=headers)).raise_for_status().json()
        categories = (await client.get(CATEGORIES_URL, headers=headers)).raise_for_status().json()
        return json.dumps({"policy_items": items, "food_categories": categories}).encode()

    def parse(self, raw: bytes) -> ParsedList:
        bundle = json.loads(raw)
        categories: dict[str, tuple[str | None, str | None]] = {}
        for record in bundle["food_categories"]:
            label = (_value(record, "refDataFoodCategoryLevel"), _value(record, "refDataFoodCategoryEN"))
            for item in _walk(record):
                categories[str(item["id"])] = label

        items = bundle["policy_items"]
        groups = {_value(i, "policyItemCode"): i for i in items if not normalize_e_number(_value(i, "eNumber") or "")}
        substances, rules = [], []
        for item in items:
            e_number = normalize_e_number(_value(item, "eNumber") or "")
            if not e_number:
                continue
            name = _value(item, "displayName") or e_number
            code = _value(item, "policyItemCode")
            aliases = [(n, "name", "en") for n in dict.fromkeys(
                [_value(item, "identifyingName") or name] + [s for s in _values(item, "synonyms")]
            ) if n]
            substances.append(ParsedSubstance(key=e_number, name=name, e_number=e_number, aliases=aliases))
            rules.append(self._authorisation(item, e_number, code, groups, categories))
            if e_number in ANNEX_V:
                rules.append(ParsedRule(
                    substance_key=e_number, place="EU", authority=AUTHORITY, kind="law", status="warning_label",
                    applies_to="food_additive", condition=ANNEX_V_WARNING,
                    legal_reference="Regulation (EC) No 1333/2008, Article 24 and Annex V",
                    source_url=REGULATION_URL, row_ref=f"Annex V, {e_number}",
                ))
        return ParsedList(place="EU", applies_to="food_additive", semantics="positive", substances=substances,
                          rules=rules, legal_reference="Regulation (EC) No 1333/2008, Article 4(1)",
                          legal_basis_quote=LEGAL_BASIS)

    def _authorisation(self, item, e_number, code, groups, categories) -> ParsedRule:
        own = self._uses(item, categories)
        group_names = [_value(groups[g], "displayName") for g in _values(item, "memberOfFADGroup") if g in groups]
        group_uses = sum(len(self._uses(groups[g], categories)) for g in _values(item, "memberOfFADGroup") if g in groups)
        base = dict(substance_key=e_number, place="EU", authority=AUTHORITY, kind="law", applies_to="food_additive",
                    source_url=DETAILS_URL.format(code=code), row_ref=f"Annex II, {e_number} ({code})")
        note = _value(item, "policyItemNoteText") or ""
        if not own and not group_uses and "is not authorised" in note:
            amended = re.search(r"Regulation \(?EU\)? No (\d{4}/\d+)", note)
            reference = "Regulation (EC) No 1333/2008, Annex II"
            if amended:
                reference += f" (as amended by Regulation (EU) {amended.group(1)})"
            return ParsedRule(**base, status="not_authorised", legal_reference=reference,
                              condition=note.split("’;")[0].strip(" ’'"))
        if not own and not group_uses:
            # Listed, but its uses sit under a group entry or in Annex III (carriers, enzymes, flavourings).
            return ParsedRule(**base, status="allowed_with_limits", legal_reference="Regulation (EC) No 1333/2008",
                              condition="On the Union list without food categories of its own: its uses are set "
                                        "under a group entry or in Annex III (in food additives, enzymes, "
                                        "flavourings or nutrients)")
        if len(own) <= 3 and not group_names:
            condition = "; ".join(own.values())
        else:
            condition = f"Permitted in {len(own)} food categor{'y' if len(own) == 1 else 'ies'}"
            if group_names:
                condition += " and through " + ", ".join(n.split(",")[0] for n in group_names if n)
            condition += ", with maximum levels in the official list"
        return ParsedRule(**base, status="allowed_with_limits", condition=condition,
                          legal_reference="Regulation (EC) No 1333/2008, Annex II")

    @staticmethod
    def _uses(item: dict, categories) -> dict[str, str]:
        """Food category → its plain conditions, for entries that name a food category."""
        uses: dict[str, str] = {}
        for use in _children(item, "foodCategoryRestriction"):
            category_id = _value(use, "foodCategoryId")
            if not category_id:
                continue
            level, name = categories.get(category_id, (None, None))
            title = f"{(name or 'Food category').capitalize()} ({level})" if level else (name or category_id).capitalize()
            limits = []
            for restriction in _children(use, "restriction"):
                value, unit = _value(restriction, "restrictionValue"), _value(restriction, "restrictionUnit")
                comment = _value(restriction, "restrictionComment")
                text = f"up to {value} {UNITS.get(unit or '', (unit or '').replace('FAD_RU_', '').lower())}".strip() if value else ""
                limits.append(", ".join(p for p in (text, comment) if p))
            limits = [l for l in limits if l]
            uses[category_id] = f"{title}: {'; '.join(limits)}" if limits else title
        return uses


SOURCE = register(EuFoodAdditives())
