"""Health Canada's Lists of Permitted Food Additives (15 lists, incorporated by reference in the FDR).

Source (verified 2026-11-04): https://www.canada.ca/en/health-canada/services/food-nutrition/
food-safety/food-additives/lists-permitted.html and its 15 list pages (one table each: item, food
additive, source, food, purpose of use, maximum level, notes; one lettered sub-row per use). The
pages are fetched and bundled as one JSON document. Licence: canada.ca terms and conditions;
only the regulatory facts and their wording are stored, with a link.

A positive list, but keyed by name only (no E/INS numbers), so absence is never derived into
"not authorised" for Canada: a naming difference would read as a ban.
"""
from __future__ import annotations

import json
import re

import httpx
from bs4 import BeautifulSoup

from app.services.regulation.importer import ParsedList, ParsedRule, ParsedSubstance, register

BASE = "https://www.canada.ca/en/health-canada/services/food-nutrition/food-safety/food-additives/lists-permitted/"
LISTS = {
    "1-anticaking-agents": "List of Permitted Anticaking Agents",
    "2-bleaching-maturing-dough-conditioning-agents": "List of Permitted Flour Treatment Agents",
    "3-colouring-agents": "List of Permitted Food Colours",
    "4-emulsifying-gelling-stabilizing-thickening-agents": "List of Permitted Emulsifying, Gelling, Stabilizing or Thickening Agents",
    "5-enzymes": "List of Permitted Food Enzymes",
    "6-firming-agents": "List of Permitted Firming Agents",
    "7-glazing-polishing-agents": "List of Permitted Glazing Agents",
    "8-other-accepted-uses": "List of Permitted Food Additives with Other Purposes of Use",
    "9-sweeteners": "List of Permitted Sweeteners",
    "10-adjusting-agents": "List of Permitted Acidity Regulators and Acid-Reacting Materials",
    "11-preservatives": "List of Permitted Preservatives",
    "12-sequestering-agents": "List of Permitted Sequestering Agents",
    "13-starch-modifying-agents": "List of Permitted Starch-Modifying Agents",
    "14-yeast-foods": "List of Permitted Yeast Foods",
    "15-carrier-extraction-solvents": "List of Permitted Solvents",
}


def _text(cell) -> str:
    for marker in cell.select(".wb-inv, sup"):
        marker.decompose()
    return re.sub(r"\s+", " ", cell.get_text(" ", strip=True)).replace("Footnote", "").strip(" *")


class CanadaPermittedFoodAdditives:
    slug = "ca-permitted-food-additives"
    name = "Lists of Permitted Food Additives (Health Canada)"
    licence_name = "Canada.ca terms and conditions (regulatory facts only)"
    licence_url = "https://www.canada.ca/en/transparency/terms.html"
    default_url = BASE.rstrip("/") + ".html"

    async def fetch(self, client: httpx.AsyncClient) -> bytes:
        pages = {slug: (await client.get(f"{BASE}{slug}.html")).raise_for_status().text for slug in LISTS}
        return json.dumps({"lists": pages}).encode()

    def parse(self, raw: bytes) -> ParsedList:
        substances: dict[str, ParsedSubstance] = {}
        rules: list[ParsedRule] = []
        for slug, page in json.loads(raw)["lists"].items():
            table = BeautifulSoup(page, "html.parser").select_one("main table") or BeautifulSoup(page, "html.parser").find("table")
            item, uses, remaining = None, [], 0
            for row in table.find_all("tr"):
                if row.find_parent("thead") is not None:
                    continue
                cells = row.find_all(["td", "th"])
                if remaining == 0:
                    if item:
                        rules.append(self._rule(slug, *item, uses))
                        item = None
                    if len(cells) < 4:  # footnotes
                        continue
                    remaining = int(cells[0].get("rowspan", 1))
                    number, name = _text(cells[0]), _text(cells[1])
                    item, uses, cells = (number, name), [], cells[3:]
                    substances.setdefault(name.casefold(), ParsedSubstance(key=name.casefold(), name=name))
                food, purpose, level = ([_text(c) for c in cells] + ["", "", ""])[:3]
                if food:
                    uses.append((food, level))
                remaining -= 1
            if item:
                rules.append(self._rule(slug, *item, uses))
        return ParsedList(place="CA", applies_to="food_additive", semantics="positive",
                          substances=list(substances.values()), rules=rules)

    @staticmethod
    def _rule(slug: str, number: str, name: str, uses: list[tuple[str, str]]) -> ParsedRule:
        if len(uses) <= 3:
            condition = "; ".join(f"{food}: {level}" if level else food for food, level in uses)
        else:
            condition = f"Permitted in {len(uses)} listed foods or uses, with maximum levels in the official list"
        return ParsedRule(
            substance_key=name.casefold(), place="CA", authority="Health Canada", kind="law",
            status="allowed_with_limits", applies_to="food_additive", condition=condition or None,
            legal_reference=f"{LISTS.get(slug, slug)} (Health Canada), item {number}",
            source_url=f"{BASE}{slug}.html", row_ref=f"{slug} {number}",
        )


SOURCE = register(CanadaPermittedFoodAdditives())
