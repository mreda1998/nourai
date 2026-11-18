"""
Skin check: what a cosmetic label tells us, read against cited references.

Four plain-rule reads, no score:

* **Actives** — the ingredients tested in people for what the product claims,
  how strong that evidence is, and whether the label order suggests the product
  holds enough of them (the "1 % line").
* **Skin reactions** — contact allergens and irritants dermatology clinics see,
  weighed by whether the product stays on the skin or is rinsed off.
* **Sun protection** — which UV filters it uses, whether they reach long UVA,
  and whether avobenzone is stabilised.
* **Good to know** — pregnancy, sun sensitivity, and the myths (parabens,
  silicones, alcohol) where the evidence says something different.

Pure functions, no I/O. Reference data lives in app/core/cosmetics.py.
"""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field

from app.core.cosmetics import (
    ACTIVES, ALLERGENS, AVOBENZONE_STABILISERS, BANNED_PARABENS, D4_D5, LEAVE_ON_WORDS, ONE_PERCENT_MARKERS,
    DRYING_ALCOHOLS, PARABENS, RINSE_OFF_WORDS, ROLE_PATTERNS, ROLES, SILICONES, SOURCES, SULFATES, UV_FILTERS, Active, Allergen,
    UvFilter,
)

Tone = Literal["neutral", "good", "moderate", "weak"]
_STRENGTH_LABEL = {"strong": "Strong evidence", "moderate": "Good evidence", "limited": "Early evidence", "little": "Little evidence"}
_STRENGTH_TONE: dict[str, Tone] = {"strong": "good", "moderate": "good", "limited": "moderate", "little": "weak"}
_FDA_LABEL = {
    "safe": "FDA: safe and effective",
    "more_data": "FDA: more safety data requested",
    "not_safe": "FDA: not safe and effective",
    "not_approved": "Not approved in the US",
}


# ─── Response models ──────────────────────────────────────────────────────────

class SkinSource(BaseModel):
    label: str
    url: str


class SkinActive(BaseModel):
    name: str                 # "Niacinamide"
    label_name: str           # as written on the label
    does: str                 # "Redness, pores, barrier"
    evidence: str             # "Good evidence"
    tone: Tone
    reality: str              # what the trials show
    studied: str | None = None  # "2–5 %"
    amount: str | None = None   # "5 %" when the label says
    likely_low: bool = False    # below the 1 % line while trials used more
    source: SkinSource


class SkinFlag(BaseModel):
    name: str
    label_name: str
    kind: Literal["frequent", "listed", "irritant", "photo"]
    note: str
    source: SkinSource


class SunFilter(BaseModel):
    name: str
    label_name: str
    covers: str               # "UVB + long UVA"
    status: str               # FDA status, in words
    amount: str | None = None
    note: str | None = None


class SunCheck(BaseModel):
    filters: list[SunFilter]
    broad: bool               # reaches long UVA (340–400 nm)
    stabilised: bool | None = None  # avobenzone only: paired with a stabiliser
    tone: Tone
    verdict: str
    detail: str
    sources: list[SkinSource]


class SkinNote(BaseModel):
    key: str
    title: str
    body: str
    tone: Tone = "neutral"
    source: SkinSource | None = None


class SkinCheck(BaseModel):
    use: Literal["leave-on", "rinse-off"]
    one_percent_index: int | None = None  # label position from which everything is ≤ 1 %
    one_percent_marker: str | None = None  # the ingredient that sets it
    actives: list[SkinActive] = []
    flags: list[SkinFlag] = []
    sun: SunCheck | None = None
    notes: list[SkinNote] = []
    free_of: list[str] = []
    checked_allergens: int = 0
    recognised: int = 0       # label rows we could name a role or reference for
    roles: list[str | None] = Field(default_factory=list, exclude=True)


def _source(key: str) -> SkinSource:
    label, url = SOURCES[key]
    return SkinSource(label=label, url=url)


# ─── Reading the label ────────────────────────────────────────────────────────

_PCT = re.compile(r"(\d+(?:[.,]\d+)?)\s*%")
_PARENS = re.compile(r"\(([^)]*)\)")


def _variants(raw: str) -> tuple[list[str], str | None]:
    """Normalised ways a label row names its ingredient, plus any stated percent."""
    text = raw.lower().replace("’", "'").strip()
    pct = _PCT.search(text)
    amount = f"{pct.group(1).replace(',', '.')}\u00a0%" if pct else None
    text = _PCT.sub(" ", text)
    text = re.sub(r"^\*+|\*+$", "", text).strip()
    inside = [p.strip() for p in _PARENS.findall(text) if p.strip()]
    outside = re.sub(r"\s+", " ", _PARENS.sub(" ", text)).strip(" .,;:")
    found = [outside, *inside]
    for v in list(found):
        if "/" in v and " / " not in v and not re.search(r"\w/\w+ \w", v):
            found.extend(part.strip() for part in v.split("/"))
        elif " / " in v:
            found.extend(part.strip() for part in v.split(" / "))
    clean = []
    for v in found:
        v = re.sub(r"\s+", " ", v).strip(" .,;:")
        if v and v not in clean:
            clean.append(v)
    return clean, amount


def _hits(term: str, variant: str) -> int:
    """How well a reference term names a label variant: 2 exact, 1 contained, 0 no."""
    if variant == term:
        return 2
    if len(term) >= 12 and re.search(rf"(?<![\w-]){re.escape(term)}(?![\w-])", variant):
        return 1
    return 0


def _best(entries, variants: list[str]):
    """The reference entry whose term names this row best (exact, then longest term)."""
    best, best_key = None, (0, 0)
    for entry in entries:
        for term in entry.terms:
            for v in variants:
                score = _hits(term, v)
                if score and (score, len(term)) > best_key:
                    best, best_key = entry, (score, len(term))
    return best


def _role(variants: list[str]) -> str | None:
    for v in variants:
        if v in ROLES:
            return ROLES[v]
    for v in variants:
        for pattern, role in ROLE_PATTERNS:
            if re.search(pattern, v):
                return role
    return None


def _use(name: str, tags: list[str]) -> Literal["leave-on", "rinse-off"]:
    text = " ".join([name, *tags]).lower()
    if any(w in text for w in LEAVE_ON_WORDS):
        return "leave-on"
    if any(re.search(rf"\b{re.escape(w)}", text) for w in RINSE_OFF_WORDS):
        return "rinse-off"
    return "leave-on"


def _is_drying_alcohol(variant: str) -> bool:
    # Fatty alcohols (cetyl, cetearyl…) are emollients, so only the short ones count.
    return variant in DRYING_ALCOHOLS or variant.startswith(("alcohol denat", "sd alcohol"))


def _covers(f: UvFilter) -> str:
    uva = {"none": "", "short": "short UVA", "long": "long UVA"}[f.uva]
    if f.uvb and uva:
        return f"UVB + {uva}"
    return "UVB" if f.uvb else uva[0].upper() + uva[1:]


# ─── The check ────────────────────────────────────────────────────────────────

def build_skin_check(name: str, tags: list[str] | None, labels: list[str]) -> SkinCheck:
    tags = tags or []
    use = _use(name, tags)
    rows = [_variants(label) for label in labels]

    one_index: int | None = None
    one_marker: str | None = None
    for i, (variants, _) in enumerate(rows):
        hit = next((v for v in variants if v in ONE_PERCENT_MARKERS), None)
        if hit:
            one_index, one_marker = i, labels[i]
            break

    roles = [_role(v) for v, _ in rows]
    flat = [v for vs, _ in rows for v in vs]

    actives: list[SkinActive] = []
    seen_actives: set[str] = set()
    flags: list[SkinFlag] = []
    seen_flags: set[str] = set()
    filters: list[tuple[UvFilter, str, str | None]] = []
    seen_filters: set[str] = set()
    pregnancy: list[str] = []
    sun_sensitising: list[str] = []

    flagged_rows: set[int] = set()
    for i, ((variants, amount), label) in enumerate(zip(rows, labels)):
        active: Active | None = _best(ACTIVES, variants)
        if active and active.name not in seen_actives and (active.top_only is None or i < active.top_only):
            seen_actives.add(active.name)
            below = one_index is not None and i > one_index
            actives.append(SkinActive(
                name=active.name, label_name=label, does=active.does, evidence=_STRENGTH_LABEL[active.strength],
                tone=_STRENGTH_TONE[active.strength], reality=active.reality,
                studied=active.studied.replace(" %", "\u00a0%") if active.studied else None, amount=amount,
                likely_low=bool(below and active.above_one_percent and not amount),
                source=_source(active.source),
            ))
            if active.pregnancy:
                pregnancy.append(active.pregnancy)
            if active.sun_sensitising:
                sun_sensitising.append(active.name)

        allergen: Allergen | None = _best(ALLERGENS, variants)
        if allergen:
            flagged_rows.add(i)
            if roles[i] is None or roles[i] == "Plant extract":
                roles[i] = {"listed": "Fragrance allergen", "frequent": "Common allergen",
                            "irritant": "Possible irritant", "photo": "Photoallergen"}[allergen.level]
                if allergen.name == "Essential oil":
                    roles[i] = "Essential oil (fragrance)"
        if allergen and allergen.name not in seen_flags:
            seen_flags.add(allergen.name)
            flags.append(SkinFlag(name=allergen.name, label_name=label, kind=allergen.level, note=allergen.note,
                                  source=_source(allergen.source)))

        uv: UvFilter | None = _best(UV_FILTERS, variants)
        if uv:
            roles[i] = "UV filter (" + _covers(uv) + ")"
        elif active and roles[i] is None:
            roles[i] = f"Active: {active.does.split(',')[0].lower()}"
        if uv and uv.name not in seen_filters:
            seen_filters.add(uv.name)
            filters.append((uv, label, amount))

    # A row matched as an allergen may be a UV filter (oxybenzone) too; both readings hold.
    sun = _sun_check(filters, flat) if filters else None

    notes: list[SkinNote] = []
    if pregnancy:
        notes.append(SkinNote(key="pregnancy", title="Pregnancy",
                              body=f"{pregnancy[0]} If you’re pregnant or trying, check with your clinician.", tone="moderate",
                              source=_source("bozzo_2011")))
    if sun_sensitising:
        names = " and ".join(sun_sensitising[:2]).lower()
        notes.append(SkinNote(key="sun_sensitive", title="Use with sunscreen",
                              body=f"{names[0].upper()}{names[1:]} can make skin more sensitive to the sun. Wear SPF the next day.",
                              tone="moderate", source=_source("fda_aha")))
    if any(v in BANNED_PARABENS for v in flat):
        notes.append(SkinNote(key="banned_paraben", title="Contains a paraben banned in the EU",
                              body="Isopropyl-, isobutyl-, phenyl-, benzyl- and pentylparaben were banned in 2014 for lack of safety data.",
                              tone="weak", source=_source("sccs_parabens")))
    elif any(v in PARABENS for v in flat):
        notes.append(SkinNote(key="parabens", title="Parabens: what the evidence says",
                              body="Methyl- and ethylparaben are considered safe at permitted levels. Their hormone-like effect in lab tests "
                                   "is thousands of times weaker than the body’s own oestrogen; propyl- and butylparaben are capped lower in the EU.",
                              source=_source("sccs_parabens")))
    if "phenoxyethanol" in flat:
        notes.append(SkinNote(key="phenoxyethanol", title="Phenoxyethanol",
                              body="A preservative that EU scientists consider safe up to 1 %, the most a product may hold.",
                              source=_source("sccs_phenoxyethanol")))
    if any(v in D4_D5 for v in flat):
        notes.append(SkinNote(key="d4d5", title="Contains D4 or D5 silicone",
                              body="Restricted in the EU for environmental persistence, not for harm to skin.",
                              source=_source("eu_d4d5")))
    elif any(any(s in v for s in SILICONES) for v in flat):
        notes.append(SkinNote(key="silicones", title="Silicones: what the evidence says",
                              body="They smooth and protect the skin surface. They don’t “suffocate” skin and aren’t a recognised cause of breakouts.",
                              source=_source("eu_1223")))
    drying = [i for i, (vs, _) in enumerate(rows) if any(_is_drying_alcohol(v) for v in vs)]
    if drying and drying[0] < 5 and use == "leave-on":
        notes.append(SkinNote(key="alcohol", title="High in alcohol",
                              body="Alcohol near the top of a leave-on product evaporates fast and can feel drying. Evidence that it damages "
                                   "healthy skin is weak, but dry or sensitive skin may notice.",
                              source=_source("lachenmeier_2008")))

    free_of: list[str] = []
    if not any(f.name == "Fragrance" or f.kind == "listed" for f in flags):
        free_of.append("Fragrance-free")
    if not any(v in PARABENS or v in BANNED_PARABENS for v in flat):
        free_of.append("Paraben-free")
    if not any(any(s in v for s in SULFATES) for v in flat):
        free_of.append("Sulfate-free")
    if not any(any(s in v for s in SILICONES) for v in flat):
        free_of.append("Silicone-free")
    if not drying:
        free_of.append("Alcohol-free")

    return SkinCheck(
        use=use, one_percent_index=one_index, one_percent_marker=one_marker, actives=actives, flags=flags,
        sun=sun, notes=notes, free_of=free_of if labels else [],
        checked_allergens=len(ALLERGENS), roles=roles,
        recognised=sum(1 for r in roles if r) + sum(1 for i, r in enumerate(roles) if not r and i in flagged_rows),
    )


def _sun_check(found: list[tuple[UvFilter, str, str | None]], flat: list[str]) -> SunCheck:
    filters = [SunFilter(name=f.name, label_name=label, covers=_covers(f), status=_FDA_LABEL[f.fda], amount=amount,
                         note=f.note or None) for f, label, amount in found]
    names = {f.name for f, _, _ in found}
    broad = any(f.uva == "long" for f, _, _ in found)
    sources = [_source("fda_sunscreen"), _source("nambour_2011"), _source("hughes_2013")]

    stabilised: bool | None = None
    if "Avobenzone" in names:
        stabilised = (any(f.stabiliser for f, _, _ in found if f.name != "Avobenzone")
                      or any(s in v for s in AVOBENZONE_STABILISERS for v in flat))
        sources.append(_source("kockler_2012"))
    if names & {"Avobenzone", "Oxybenzone", "Octocrylene", "Homosalate", "Octisalate", "Octinoxate"}:
        sources.append(_source("matta_2020"))

    if not broad:
        tone: Tone = "moderate"
        verdict = "Mostly UVB"
        detail = ("These filters block burning UVB but little long UVA, which ages skin and passes through glass. "
                  "Look for zinc oxide, avobenzone or a newer filter.")
    elif stabilised is False and not any(f.uva == "long" and f.name != "Avobenzone" for f, _, _ in found):
        tone = "moderate"
        verdict = "UVA cover may fade"
        detail = ("Avobenzone is the only long-UVA filter here and nothing on the label stabilises it, "
                  "so its protection can drop within an hour of sun.")
    else:
        tone = "good"
        verdict = "Broad-spectrum"
        detail = ("Covers UVB and long UVA. Daily sunscreen use lowered melanoma rates and slowed visible skin aging in "
                  "a large randomized trial.")
    more_data = [f.name for f, _, _ in found if f.fda == "more_data"]
    if more_data and tone == "good":
        named = [n.lower() for n in more_data[:3]]
        listed = named[0] if len(named) == 1 else f"{', '.join(named[:-1])} and {named[-1]}"
        detail += (f" FDA has asked for more safety data on {listed}: {'it reaches' if len(named) == 1 else 'they reach'} the blood above its "
                   "testing threshold, which calls for study, not alarm.")
    return SunCheck(filters=filters, broad=broad, stabilised=stabilised, tone=tone, verdict=verdict, detail=detail,
                    sources=sources)
