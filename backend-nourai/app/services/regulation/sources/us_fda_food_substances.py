"""FDA Substances Added to Food (formerly EAFUS).

Source (verified 2026-11-04): the "download" link on
https://hfpappexternal.fda.gov/scripts/fdcc/?set=FoodSubstances —
`https://hfpappexternal.fda.gov/scripts/fdcc/cfc/XMLService.cfm?method=downloadxls&set=FoodSubstances`.
Format: CSV text with a preamble, then a header row starting "CAS Reg No". Licence: US federal
government work, public domain.

The FDA warns the inventory is partial and that inclusion is not an FDA approval, so only rows that
cite a food regulation become rules: 21 CFR 189 (prohibited from human food) → banned; direct food
additive and GRAS sections (170–174, 180, 182, 184) → allowed with limits. Colour (73/74/81/82) and
food-contact (175–178, 181) citations are left to the colour list and out of scope.
"""
from __future__ import annotations

import re

from app.services.regulation.importer import ParsedList, ParsedRule, ParsedSubstance, register
from app.services.regulation.sources.us_fda_colour_additives import LICENCE, cfr_refs, fda_rows, other_names

URL = "https://hfpappexternal.fda.gov/scripts/fdcc/cfc/XMLService.cfm?method=downloadxls&set=FoodSubstances"
PAGE = "https://hfpappexternal.fda.gov/scripts/fdcc/?set=FoodSubstances"
_FOOD_PARTS = {"170", "171", "172", "173", "174", "180", "182", "184"}
_FLAVOUR_ONLY = re.compile(r"^(flavou?ring agent or adjuvant|flavor enhancer)$", re.IGNORECASE)


def _title(name: str) -> str:
    return name[:1].upper() + name[1:].lower()


class FdaFoodSubstances:
    slug = "us-fda-food-substances"
    name = "FDA Substances Added to Food"
    licence_name, licence_url = LICENCE
    default_url = URL

    def parse(self, raw: bytes) -> ParsedList:
        substances, rules = [], []
        for row in fda_rows(raw):
            raw_name = row.get("Substance", "")
            if not raw_name or "DELISTED" in raw_name:
                continue
            name = _title(raw_name.replace("--PROHIBITED", "").strip())
            refs = cfr_refs(row)
            prohibited = [r for r in refs if r.startswith("189.")]
            food = sorted({r for r in refs if r.split(".")[0] in _FOOD_PARTS}, key=lambda r: [int(p) for p in r.split(".")])
            if not prohibited and not food:
                continue
            cas = row.get("CAS Reg No (or other ID)") or ""
            key = f"{cas}|{name}"
            substances.append(ParsedSubstance(
                key=key, name=name, cas=cas if re.match(r"^\d+-\d{2}-\d$", cas) else None,
                aliases=[(n, "name", "") for n in dict.fromkeys(other_names(row.get("Other Names", "")))],
            ))
            effects = [e.strip(" ,") for e in re.split(r"<br\s*/?>", row.get("Used for (Technical Effect)", "")) if e.strip(" ,")]
            base = dict(substance_key=key, place="US", authority="FDA", kind="law", source_url=PAGE,
                        row_ref=f"Substances Added to Food: {raw_name}")
            if prohibited:
                rules.append(ParsedRule(**base, status="banned", applies_to="food",
                                        condition="Prohibited from use in human food",
                                        legal_reference="21 CFR " + ", ".join(prohibited)))
                continue
            scope = "food" if effects and all(_FLAVOUR_ONLY.match(e) for e in effects) else "food_additive"
            uses = ", ".join(e.lower() for e in effects)
            rules.append(ParsedRule(**base, status="allowed_with_limits", applies_to=scope,
                                    condition=f"Permitted under the cited regulations{f' ({uses})' if uses else ''}",
                                    legal_reference="21 CFR " + ", ".join(food)))
        return ParsedList(place="US", applies_to="food_additive", semantics="listing",
                          substances=substances, rules=rules)


SOURCE = register(FdaFoodSubstances())
