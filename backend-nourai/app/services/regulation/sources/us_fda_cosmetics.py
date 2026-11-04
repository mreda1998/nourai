"""US prohibited and restricted cosmetic ingredients, 21 CFR Part 700 Subpart B.

Source (verified 2026-11-04): the eCFR versioner API,
`https://www.ecfr.gov/api/versioner/v1/full/{date}/title-21.xml?part=700` (needs a compressed
response). Licence: US federal government work, public domain.

Subpart B names a short, fixed set of substances; the section → substance map below is that list.
Each rule's condition is the section's own operative wording, from the paragraph that declares the
product adulterated or the use prohibited.
"""
from __future__ import annotations

import html
import re
from datetime import date

import httpx

from app.services.regulation.importer import ParsedList, ParsedRule, ParsedSubstance, register
from app.services.regulation.sources.us_fda_colour_additives import LICENCE

API = "https://www.ecfr.gov/api/versioner/v1/full/{date}/title-21.xml?part=700"
SECTION_URL = "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-G/part-700/section-{n}"
SECTIONS: dict[str, tuple[list[tuple[str, str | None]], str | None]] = {
    "700.11": ([("Bithionol", "97-18-7")], None),
    "700.13": ([("Mercury compounds", None)], None),
    "700.14": ([("Vinyl chloride", "75-01-4")], "Aerosol products"),
    "700.15": ([("Tribromsalan", None), ("Dibromsalan", None), ("Metabromsalan", None),
                ("3,3',4',5-Tetrachlorosalicylanilide", None)], None),
    "700.16": ([("Zirconium (in aerosols)", None)], "Aerosol products"),
    "700.18": ([("Chloroform", "67-66-3")], None),
    "700.19": ([("Methylene chloride", "75-09-2")], None),
    "700.23": ([("Chlorofluorocarbon propellants", None)], "Propellants"),
    "700.27": ([("Prohibited cattle materials", None)], None),
}
_OPERATIVE = re.compile(r"\b(adulterated|prohibited)\b", re.IGNORECASE)


def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", fragment))).strip()


class FdaCosmetics:
    slug = "us-fda-cosmetics"
    name = "21 CFR Part 700, Subpart B (cosmetics)"
    licence_name, licence_url = LICENCE
    default_url = API.format(date="current")

    async def fetch(self, client: httpx.AsyncClient) -> bytes:
        titles = (await client.get("https://www.ecfr.gov/api/versioner/v1/titles.json")).raise_for_status().json()
        as_of = next(t["up_to_date_as_of"] for t in titles["titles"] if t["number"] == 21)
        response = await client.get(API.format(date=as_of), headers={"Accept-Encoding": "gzip"})
        return response.raise_for_status().content

    def parse(self, raw: bytes) -> ParsedList:
        xml = raw.decode("utf-8", errors="replace")
        substances, rules = [], []
        for n, body in re.findall(r'<DIV8 N="(700\.\d+)" TYPE="SECTION"[^>]*>(.*?)</DIV8>', xml, re.DOTALL):
            if n not in SECTIONS:
                continue
            paragraphs = [_text(p) for p in re.findall(r"<P>(.*?)</P>", body, re.DOTALL)]
            start = next((i for i, p in enumerate(paragraphs) if _OPERATIVE.search(p)), 0)
            condition = " ".join(paragraphs[start:])
            if len(condition) > 900:
                condition = condition[:897].rsplit(" ", 1)[0] + "…"
            names, sub_scope = SECTIONS[n]
            for name, cas in names:
                key = f"{n}|{name}"
                substances.append(ParsedSubstance(key=key, name=name, cas=cas))
                rules.append(ParsedRule(
                    substance_key=key, place="US", authority="FDA", kind="law", status="banned",
                    applies_to="cosmetic", sub_scope=sub_scope, condition=condition,
                    legal_reference=f"21 CFR {n}", source_url=SECTION_URL.format(n=n), row_ref=f"21 CFR {n}",
                ))
        return ParsedList(place="US", applies_to="cosmetic", semantics="negative",
                          substances=substances, rules=rules)


SOURCE = register(FdaCosmetics())
