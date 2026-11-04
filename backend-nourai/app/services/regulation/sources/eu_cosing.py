"""EU cosmetics annexes from CosIng, the European Commission's cosmetic ingredient database.

Source (verified 2026-11-04): the CosIng web app's own export endpoint,
`https://api.tech.ec.europa.eu/cosing20/1.0/api/annexes/{annex}/export-csv` for annexes II–VI
(the "CSV" button on https://ec.europa.eu/growth/tools-databases/cosing/reference/annexes/list/II).
Format: UTF-8 CSV with a short preamble ("File creation date", "Last update"), then a header row
starting "Reference Number". Updated whenever Regulation (EC) No 1223/2009 is amended.
Licence: Commission reuse policy, Decision 2011/833/EU (reuse allowed with acknowledgement).

Annex II lists prohibited substances (banned). Annex III lists restricted substances, Annexes IV–VI
the only colorants, preservatives and UV filters allowed — each with its conditions.
"""
from __future__ import annotations

import csv
import io
import re

from app.services.regulation.importer import ParsedList, ParsedRule, ParsedSubstance, register

AUTHORITY = "European Commission"
REGULATION = "Regulation (EC) No 1223/2009"
EXPORT_URL = "https://api.tech.ec.europa.eu/cosing20/1.0/api/annexes/{annex}/export-csv"
PAGE_URL = "https://ec.europa.eu/growth/tools-databases/cosing/reference/annexes/list/{annex}"
LICENCE = ("Commission reuse policy (Decision 2011/833/EU)", "https://eur-lex.europa.eu/eli/dec/2011/833/oj")
_CAS = re.compile(r"^\d{2,7}-\d{2}-\d$")


def _clean(value: str | None) -> str:
    """Collapse whitespace and soft hyphens; '-' means empty in the export."""
    text = re.sub(r"\s+", " ", (value or "").replace("\xad", "")).strip()
    return "" if text == "-" else text


def _names(value: str, separators: str) -> list[str]:
    return [n for n in (_clean(part) for part in re.split(separators, value or "")) if n]


def _single_cas(value: str) -> str | None:
    cas = _clean(value)
    return cas if _CAS.match(cas) else None


class CosingAnnex:
    licence_name, licence_url = LICENCE

    def __init__(self, annex: str) -> None:
        self.annex = annex
        self.slug = f"eu-cosing-{annex.lower()}"
        self.name = f"CosIng — {REGULATION}, Annex {annex}"
        self.default_url = EXPORT_URL.format(annex=annex)
        self.page_url = PAGE_URL.format(annex=annex)

    def parse(self, raw: bytes) -> ParsedList:
        rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
        start = next(i for i, row in enumerate(rows) if row and row[0] == "Reference Number")
        header = rows[start]
        substances: list[ParsedSubstance] = []
        rules: list[ParsedRule] = []
        for row in rows[start + 1:]:
            if not row or not _clean(row[0]):
                continue
            cell = dict(zip(header, row))
            ref = _clean(cell["Reference Number"])
            chemical = _clean(cell.get("Chemical name / INN") or cell.get("Chemical name"))
            glossary = cell.get("Name of Common Ingredients Glossary") or cell.get(
                "Colour index Number / Name of Common Ingredients Glossary") or ""
            inci_names = _names(glossary, r"[/;]") + _names(cell.get("Identified INGREDIENTS or substances e.g.", ""), r",")
            key = f"{self.annex}/{ref}"
            names = list(dict.fromkeys(inci_names))
            single = len({n.casefold() for n in names}) == 1
            substances.append(ParsedSubstance(
                key=key, name=chemical or (names[0] if names else key),
                cas=_single_cas(cell.get("CAS Number", "")),
                inci=names[0] if single else None,
                # An entry covering several ingredients (parabens, retinoids) lists them as members:
                # a label matches them only when no specific substance claims the name.
                aliases=[(n, "inci", "") for n in names] if single else [],
                group_aliases=[] if single else [(n, "inci", "") for n in names],
            ))
            rules.append(self._rule(key, ref, chemical, cell))
        return ParsedList(place="EU", applies_to="cosmetic",
                          semantics="negative" if self.annex in ("II", "III") else "positive",
                          substances=substances, rules=rules)

    def _rule(self, key: str, ref: str, chemical: str, cell: dict) -> ParsedRule:
        reference = f"{REGULATION}, Annex {self.annex}, entry {ref}"
        amended = _clean(cell.get("Regulation"))
        if amended and amended != "(EC) 2009/1223":
            reference += f" (as amended by Regulation {amended})"
        if self.annex == "II":
            status = "banned"
            condition = chemical if re.search(r"\bexcept", chemical, re.IGNORECASE) else None
            sub_scope = None
        else:
            parts = [
                ("Maximum concentration", _clean(cell.get("Maximum concentration in ready for use preparation"))),
                ("Other", _clean(cell.get("Other"))),
                ("Conditions of use and warnings", _clean(cell.get("Wording of conditions of use and warnings"))),
            ]
            condition = ". ".join(f"{label}: {text.rstrip('.')}" for label, text in parts if text) or None
            sub_scope = _clean(cell.get("Product Type, body parts")) or None
            status = "allowed_with_limits" if condition or sub_scope or self.annex == "III" else "allowed"
        return ParsedRule(
            substance_key=key, place="EU", authority=AUTHORITY, kind="law", status=status,
            applies_to="cosmetic", sub_scope=sub_scope, condition=condition, legal_reference=reference,
            source_url=self.page_url, row_ref=f"Annex {self.annex}, entry {ref}",
        )


COSING_SOURCES = {annex: register(CosingAnnex(annex)) for annex in ("II", "III", "IV", "V", "VI")}
