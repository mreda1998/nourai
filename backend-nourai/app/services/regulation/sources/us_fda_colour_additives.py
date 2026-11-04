"""FDA Regulatory Status of Color Additives.

Source (verified 2026-11-04): the "download" link on
https://www.fda.gov/industry/color-additive-inventories/color-additive-status-list —
`https://hfpappexternal.fda.gov/scripts/fdcc/cfc/XMLService.cfm?method=downloadxls&set=ColorAdditives`.
Format: CSV text with a two-line preamble, then a header row starting "CAS Reg No". Updated when a
listing changes. Licence: US federal government work, public domain (17 U.S.C. § 105).

US colour additives are a positive list (21 CFR 73/74): a colour may be used only where it is listed.
Delisted colours are not authorised; a revocation with a date ("no longer permanently listed after
January 15, 2027") becomes a ban from that date.
"""
from __future__ import annotations

import csv
import html
import io
import re
from datetime import date, datetime, timedelta

from app.services.regulation.importer import ParsedList, ParsedRule, ParsedSubstance, register

URL = "https://hfpappexternal.fda.gov/scripts/fdcc/cfc/XMLService.cfm?method=downloadxls&set=ColorAdditives"
PAGE = "https://www.fda.gov/industry/color-additive-inventories/color-additive-status-list"
AUTHORITY = "FDA"
LICENCE = ("US federal government work (public domain)", "https://www.usa.gov/government-copyright")
_CFR = re.compile(r'=T\("([\d.]+)"\)')
_REVOKED = re.compile(r"food use[^;.]*?no longer (?:be )?permanently listed after (\w+ \d{1,2}, \d{4})", re.IGNORECASE)


def fda_rows(raw: bytes) -> list[dict[str, str]]:
    """The FDA inventory downloads: a preamble, then CSV from the "CAS Reg No" header."""
    text = raw.decode("utf-8", errors="replace")
    start = text.index("CAS Reg No")
    return [{k.strip(): (v or "").strip() for k, v in row.items() if k}
            for row in csv.DictReader(io.StringIO(text[start:]))]


def other_names(value: str) -> list[str]:
    names = [html.unescape(re.sub(r"<[^>]+>", "", part)).replace("♦", "").strip()
             for part in re.split(r"<br\s*/?>", value)]
    return [n for n in names if n]


def cfr_refs(row: dict[str, str]) -> list[str]:
    return [ref for value in row.values() for ref in _CFR.findall(value)]


def _section_ref(refs: list[str], scope: str) -> str | None:
    """21 CFR 73/74 sections: x.1–x.999 foods, x.1000s drugs, x.2000s cosmetics, x.3000s devices."""
    for ref in refs:
        part, _, section = ref.partition(".")
        if part in ("73", "74") and section.isdigit():
            n = int(section)
            if (scope == "food" and n < 1000) or (scope == "cosmetic" and 2000 <= n < 3000):
                return f"21 CFR {ref}"
    return None


class FdaColourAdditives:
    slug = "us-fda-colour-additives"
    name = "FDA Regulatory Status of Color Additives"
    licence_name, licence_url = LICENCE
    default_url = URL

    def parse(self, raw: bytes) -> ParsedList:
        substances, rules = [], []
        for row in fda_rows(raw):
            name = html.unescape(row.get("Color", ""))
            if not name:
                continue
            key = row.get("CAS Reg No or other ID code") or name
            key = f"{key}|{name}"
            cas = row.get("CAS Reg No or other ID code") or None
            e_number = row.get("EEC No") or None
            names = [(n, "name", "") for n in dict.fromkeys(other_names(row.get("Other names", "")))]
            substances.append(ParsedSubstance(
                key=key, name=name, cas=cas if cas and re.match(r"^\d+-\d{2}-\d$", cas) else None,
                e_number=e_number,
                # With an E-number the colour is matched by it: FDA's names ("Turmeric") must not
                # capture the spice on a label.
                aliases=[] if e_number else names,
                group_aliases=names if e_number else [],
                name_is_alias=not e_number,
            ))
            rules += self._rules(key, name, row)
        return ParsedList(place="US", applies_to="food_additive", semantics="positive",
                          substances=substances, rules=rules)

    def _rules(self, key: str, name: str, row: dict[str, str]) -> list[ParsedRule]:
        status, use, former = row.get("Status", ""), row.get("Use", ""), row.get("Former use", "")
        refs = cfr_refs(row)
        base = dict(substance_key=key, place="US", authority=AUTHORITY, kind="law", source_url=PAGE,
                    row_ref=f"Color additive status: {name}")
        out: list[ParsedRule] = []
        for scope, word, rule_scope in (("food", "Foods", "food_additive"), ("cosmetic", "Cosmetics", "cosmetic")):
            listed_now = word in use and not status.startswith("Delisted")
            if listed_now:
                reference = _section_ref(refs, scope)
                current = ParsedRule(**base, status="allowed_with_limits", applies_to=rule_scope,
                                     condition=row.get("RESTRICTIONS") or None, legal_reference=reference)
                revoked = _REVOKED.search(status) if scope == "food" else None
                if revoked:
                    when = datetime.strptime(revoked.group(1), "%B %d, %Y").date()
                    current.effective_until = when - timedelta(days=1)
                    out.append(ParsedRule(**base, status="banned", applies_to=rule_scope, effective_from=when,
                                          condition=status, legal_reference=reference))
                out.append(current)
            elif word in former or (status.startswith("Delisted") and word.lower() in former.lower()):
                out.append(ParsedRule(**base, status="not_authorised", applies_to=rule_scope,
                                      condition=f"Delisted for this use ({former or status})"))
        return out


SOURCE = register(FdaColourAdditives())
