"""Health Canada's Cosmetic Ingredient Hotlist (prohibited and restricted ingredients).

Source (verified 2026-11-04): https://www.canada.ca/en/health-canada/services/consumer-product-safety/
cosmetics/cosmetic-ingredient-hotlist-prohibited-restricted-ingredients/hotlist.html — one HTML page
with two tables: prohibited (ingredient, CAS, synonyms) and restricted (with conditions of use by
product type, maximum concentration and required warnings, one lettered sub-row each). canada.ca
refuses curl's default client but answers a plain HTTP client. Licence: canada.ca terms and
conditions (Crown copyright); only the regulatory facts and their wording are stored, with a link.
"""
from __future__ import annotations

import re

from bs4 import BeautifulSoup

from app.services.regulation.importer import ParsedList, ParsedRule, ParsedSubstance, register

URL = ("https://www.canada.ca/en/health-canada/services/consumer-product-safety/cosmetics/"
       "cosmetic-ingredient-hotlist-prohibited-restricted-ingredients/hotlist.html")
AUTHORITY = "Health Canada"
_CAS = re.compile(r"^\d{2,7}-\d{2}-\d$")


def _text(cell) -> str:
    return re.sub(r"\s+", " ", cell.get_text(" ", strip=True)).replace(" .", ".").strip()


def _substance(name: str, cas: str, synonyms: str) -> ParsedSubstance:
    numbers = [c.strip() for c in re.split(r"[;,]", cas) if c.strip()]
    return ParsedSubstance(
        key=name, name=name, cas=numbers[0] if len(numbers) == 1 and _CAS.match(numbers[0]) else None,
        aliases=[(s, "name", "en") for s in dict.fromkeys(p.strip() for p in synonyms.split(";")) if s],
    )


class CanadaCosmeticHotlist:
    slug = "ca-cosmetic-hotlist"
    name = "Cosmetic Ingredient Hotlist (Health Canada)"
    licence_name = "Canada.ca terms and conditions (regulatory facts only)"
    licence_url = "https://www.canada.ca/en/transparency/terms.html"
    default_url = URL

    def parse(self, raw: bytes) -> ParsedList:
        soup = BeautifulSoup(raw.decode("utf-8", errors="replace"), "html.parser")
        tables = soup.select("main table") or soup.find_all("table")
        prohibited = next(t for t in tables if "Prohibited" in (t.caption.get_text() if t.caption else ""))
        restricted = next(t for t in tables if "Restricted" in (t.caption.get_text() if t.caption else ""))
        substances, rules = [], []
        base = dict(place="CA", authority=AUTHORITY, kind="law", applies_to="cosmetic", source_url=URL)

        for row in self._body_rows(prohibited):
            cells = [_text(c) for c in row.find_all(["td", "th"])]
            if len(cells) < 3 or not cells[0]:
                continue
            substance = _substance(*cells[:3])
            substances.append(substance)
            rules.append(ParsedRule(
                **base, substance_key=substance.key, status="banned",
                condition=cells[0] if re.search(r"\bexcept", cells[0], re.IGNORECASE) else None,
                legal_reference="Cosmetic Ingredient Hotlist (Health Canada), prohibited list",
                row_ref=f"Prohibited: {cells[0]}",
            ))

        entry, lines, remaining = None, [], 0
        for row in self._body_rows(restricted):
            cells = row.find_all(["td", "th"])
            if remaining == 0:
                if entry:
                    rules.append(self._restricted(base, entry, lines))
                remaining = int(cells[0].get("rowspan", 1))
                entry = _substance(*[_text(c) for c in cells[:3]])
                substances.append(entry)
                lines, cells = [], cells[3:]
            use, maximum, warning = ([_text(c) for c in cells] + ["", "", ""])[:3]
            line = use + (f" — maximum {re.sub(r'^[a-z]\) ', '', maximum)}" if maximum else "")
            if warning:
                line += f". Warnings: {re.sub(r'^[a-z]\) ', '', warning)}"
            if line.strip():
                lines.append(line)
            remaining -= 1
        if entry:
            rules.append(self._restricted(base, entry, lines))
        return ParsedList(place="CA", applies_to="cosmetic", semantics="negative",
                          substances=substances, rules=rules)

    @staticmethod
    def _body_rows(table) -> list:
        return [r for r in table.find_all("tr") if r.find_parent("thead") is None and r.find("td")]

    @staticmethod
    def _restricted(base: dict, entry: ParsedSubstance, lines: list[str]) -> ParsedRule:
        return ParsedRule(
            **base, substance_key=entry.key, status="allowed_with_limits", condition=" ".join(lines) or None,
            legal_reference="Cosmetic Ingredient Hotlist (Health Canada), restricted list",
            row_ref=f"Restricted: {entry.name}",
        )


SOURCE = register(CanadaCosmeticHotlist())
