"""
Verdicts: what the label and the research library let us say, and nothing more.

Two things are decided here, both by plain rules a reader can check:

* an ingredient's **standing** on a product label, from the verdicts of its
  researched claims (never from its category: being an additive is not a risk);
* a product's **verdict**, from a few independent checks ("pillars") that each
  rest on a cited reference: the nutrition panel, the processing level, the dose
  against its range, the claims behind the ingredients, and the rules in force.

There is no 0-100 score. Each pillar keeps its own answer, the overall level is
the worst of them, and anything we have not reviewed stays "not reviewed"
instead of counting for or against the product. Pure functions, no I/O.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Literal

from pydantic import BaseModel, Field

Tone = Literal["neutral", "good", "moderate", "weak"]
Standing = Literal["risk", "caution", "clear", "unreviewed"]
Level = Literal["good", "mixed", "poor", "unknown"]

# ─── Claims → plain answers ───────────────────────────────────────────────────
# Mirrors nourai/utils/evidence.ts so a claim reads the same on every screen.

_HOLDS = {"strong", "moderate", "limited"}
_BENEFIT_ANSWERS = {"high": ("Works", "good"), "moderate": ("Probably works", "good"), "low": ("May work", "moderate")}
_RISK_ANSWERS = {"high": "Known risk", "moderate": "Likely risk", "low": "Possible risk"}
_SURE = {"high", "moderate"}
_CERTAINTY_RANK = {"high": 3, "moderate": 2, "low": 1, "very_low": 0}


@dataclass(frozen=True, slots=True)
class IngredientStanding:
    level: Standing
    label: str | None = None          # "Likely risk", "No known concerns"
    note: str | None = None           # the claim it rests on, in the reader's words
    benefit_label: str | None = None  # "Probably works"
    benefit_note: str | None = None   # the benefit claim
    benefit_tone: Tone = "neutral"


UNREVIEWED = IngredientStanding(level="unreviewed")


def _judged(claims: Iterable[Any], kind: str) -> list[Any]:
    return [c for c in claims if c.kind == kind and c.verdict and c.verdict != "insufficient"]


def _rank(claim: Any) -> int:
    return _CERTAINTY_RANK.get(claim.certainty or "very_low", 0)


def ingredient_standing(ingredient: Any | None) -> IngredientStanding:
    """Where a researched ingredient stands, from its claims. Unknown stays unknown."""
    claims = list(getattr(ingredient, "claims", None) or []) if ingredient is not None else []
    safety, benefit = _judged(claims, "safety"), _judged(claims, "benefit")
    if not safety and not benefit:
        return UNREVIEWED

    level: Standing = "clear"
    label: str | None = "No known concerns"
    note: str | None = None
    # A supported risk, most certain first; evidence too thin to call (very low) never flags.
    for claim in sorted(safety, key=_rank, reverse=True):
        certainty = claim.certainty or "very_low"
        if claim.verdict in _HOLDS and certainty in _RISK_ANSWERS:
            level = "risk" if certainty in _SURE else "caution"
            label, note = _RISK_ANSWERS[certainty], claim.claim
            break
        if claim.verdict == "mixed" and certainty != "very_low":
            level, label, note = "caution", "Mixed reports", claim.claim
            break
    if level == "clear" and not safety:
        label = None  # benefits were studied, safety was not: say nothing about safety

    best_label, best_note, best_tone, best_score = None, None, "neutral", -1
    for claim in benefit:
        certainty = claim.certainty or "very_low"
        if claim.verdict in _HOLDS and certainty in _BENEFIT_ANSWERS:
            answer, tone = _BENEFIT_ANSWERS[certainty]
            if _rank(claim) > best_score:
                best_label, best_note, best_tone, best_score = answer, claim.claim, tone, _rank(claim)
    if best_label is None and benefit and all(c.verdict == "unlikely" for c in benefit):
        best_label, best_tone = "Unlikely to work", "weak"
        best_note = benefit[0].claim

    return IngredientStanding(
        level=level, label=label, note=note,
        benefit_label=best_label, benefit_note=best_note, benefit_tone=best_tone,  # type: ignore[arg-type]
    )


# ─── Product verdict ──────────────────────────────────────────────────────────

class VerdictPillar(BaseModel):
    key: str                 # nutrition | processing | dose | evidence | ingredients | sun | actives | reactions
    label: str               # "Nutrition"
    tone: Tone
    verdict: str             # "High in sugar & sodium"
    detail: str | None = None
    # How this check reads inside the summary sentence; not part of the response.
    clause: str = Field(default="", exclude=True)


class ProductVerdict(BaseModel):
    level: Level
    tone: Tone
    headline: str            # "Worth a closer look"
    summary: str             # one sentence naming the reasons
    pillars: list[VerdictPillar]
    reviewed_count: int      # label ingredients with researched claims
    ingredient_count: int
    basis: str               # what the verdict rests on, in words


_HEADLINES: dict[str, tuple[str, Tone]] = {
    "good": ("Looks good", "good"),
    "mixed": ("Worth a closer look", "moderate"),
    "poor": ("Think twice", "weak"),
    "unknown": ("Not enough to judge yet", "neutral"),
}
_SHORT = {"Saturated fat": "sat fat"}


def _join(items: list[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} & {items[-1]}"


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _list(items: list[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


def _reviewed(reviewed: int, total: int) -> str:
    if reviewed == total:
        return "Every ingredient reviewed." if total > 1 else "The one ingredient is reviewed."
    return f"{reviewed} of {total} ingredients reviewed."


def _nutrition_pillar(panel: Any | None, per_100g_high: list[str] | None = None) -> VerdictPillar | None:
    """
    High if a nutrient is high per serving (FDA 5%/20%) *or* per 100 g (UK FSA).
    A per-serving check alone lets a tiny listed serving hide a sugary food:
    15 g of a hazelnut spread is "moderate" in sugar, 100 g of it is 56 g.
    """
    if panel is None:
        return None
    limits = [m for m in panel.measures if m.kind == "limit"]
    serving_high = [m.label for m in limits if m.band == "high"]
    per_100g = [label for label in (per_100g_high or []) if label not in serving_high]
    order = [m.label for m in limits]
    highs_full = sorted(serving_high + per_100g, key=lambda l: order.index(l) if l in order else 99)
    highs = [_SHORT.get(l, l.lower()) for l in highs_full]
    sources = [m.label.lower() for m in panel.measures if m.kind == "goal" and m.band in ("high_source", "good_source")]
    per = "per serving" if panel.basis == "serving" else "per 100 g"
    if highs:
        verdict = f"{len(highs)} nutrients high" if len(highs) > 2 else f"High in {_join(highs)}"
        if serving_high and per_100g:
            detail = f"20% or more of the daily reference {per}; {_list([l.lower() for l in per_100g])} high per 100 g."
        elif serving_high:
            detail = f"20% or more of the daily reference {per}."
        else:
            detail = ("High per 100 g by UK Food Standards Agency limits, "
                      "even though the listed serving is small.")
        return VerdictPillar(key="nutrition", label="Nutrition", tone="weak", verdict=verdict, detail=detail,
                             clause=f"it is high in {_list([l.lower() for l in highs_full])}")
    if not limits:
        return VerdictPillar(key="nutrition", label="Nutrition", tone="neutral", verdict="Partial label",
                             detail="The label doesn’t list sugar, saturated fat or sodium.")
    if any(m.band == "moderate" for m in limits):
        middling = [m.label.lower() for m in limits if m.band == "moderate"]
        return VerdictPillar(key="nutrition", label="Nutrition", tone="moderate", verdict="Moderate",
                             detail=f"Nothing high {per}; moderate in {_list(middling)}.",
                             clause=f"it is moderate in {_list(middling)}")
    detail = f"Good source of {_join(sources)}." if sources else f"Low in sugar, saturated fat and sodium {per}."
    return VerdictPillar(key="nutrition", label="Nutrition", tone="good", verdict="Nothing high", detail=detail,
                         clause="nothing on the nutrition panel is high")


def _processing_pillar(processing: Any | None) -> VerdictPillar | None:
    if processing is None:
        return None
    return VerdictPillar(key="processing", label="Processing", tone=processing.tone, verdict=processing.label,
                         detail=f"NOVA group {processing.nova_group} of 4.",
                         clause=f"it is {processing.label[0].lower()}{processing.label[1:]}")


def _dose_pillar(doses: list[Any]) -> VerdictPillar | None:
    if not doses:
        return None
    over = [d.label for d in doses if d.band == "over_ul"]
    off = [d for d in doses if d.band in ("under", "over") and d.tone == "moderate"]
    in_range = sum(1 for d in doses if d.band == "in_range")
    if over:
        return VerdictPillar(key="dose", label="Dose", tone="weak", verdict=f"{_join(over[:2])} above the upper limit"
                             if len(over) <= 2 else f"{len(over)} above the upper limit",
                             detail="Above the NIH tolerable upper intake level per serving.",
                             clause=f"{_list([o.lower() for o in over[:2]]) if len(over) <= 2 else f'{len(over)} doses'} "
                                    f"{'is' if len(over) == 1 else 'are'} above the upper limit")
    if off:
        below = sum(1 for d in off if d.band == "under")
        verdict = (f"{below} below the studied range" if below == len(off)
                   else f"{len(off)} outside the studied range")
        return VerdictPillar(key="dose", label="Dose", tone="moderate", verdict=verdict,
                             detail="Compared with the doses used in the studies we reviewed.",
                             clause=f"{_plural(len(off), 'dose')} {'sits' if len(off) == 1 else 'sit'} outside the studied range")
    if in_range == len(doses):
        return VerdictPillar(key="dose", label="Dose", tone="good", verdict="In range",
                             detail=f"{_plural(in_range, 'dose')} checked against a daily value or studied range.",
                             clause="the dose is in range" if in_range == 1 else "the doses are in range")
    return VerdictPillar(key="dose", label="Dose", tone="neutral", verdict=f"{in_range} of {len(doses)} in range",
                         detail="The rest are below the daily value, which is not a concern.")


def _evidence_pillar(rows: list[Any]) -> VerdictPillar | None:
    """The best-supported thing the product's ingredients are believed to do."""
    rated = [r for r in rows if r.benefit_label]
    if not rated:
        return None
    order = {"good": 0, "moderate": 1, "weak": 2, "neutral": 3}
    best = min(rated, key=lambda r: order.get(r.benefit_tone or "neutral", 3))
    tone: Tone = best.benefit_tone or "neutral"
    supported = sum(1 for r in rated if r.benefit_tone == "good")
    if tone == "good":
        verdict = f"{_plural(supported, 'ingredient')} backed by trials"
        clause = f"{best.name.lower()} is backed by trials"
    elif tone == "moderate":
        verdict = "Early evidence only"
        clause = "the evidence for what it promises is still early"
    else:
        verdict = "Claims not supported"
        clause = "the studies don’t support what it promises"
    claim = f"“{best.benefit_note}”: " if best.benefit_note else ""
    return VerdictPillar(key="evidence", label="Evidence", tone=tone, verdict=verdict, clause=clause,
                         detail=f"{best.name}. {claim}{best.benefit_label.lower()}.")


def _ingredients_pillar(rows: list[Any], extras: list[Any], glance: Any | None) -> tuple[VerdictPillar | None, int]:
    total = len(rows)
    reviewed = sum(1 for r in rows if r.standing and r.standing != "unreviewed")
    here = getattr(glance, "where_you_live", 0) or 0
    elsewhere = getattr(glance, "elsewhere", 0) or 0
    risks = [r.name for r in rows if r.standing == "risk"]
    cautions = [r.name for r in rows if r.standing == "caution"]
    if not total and not extras:
        return None, reviewed

    def pillar(tone: Tone, verdict: str, detail: str | None, clause: str = "") -> VerdictPillar:
        return VerdictPillar(key="ingredients", label="Ingredients", tone=tone, verdict=verdict, detail=detail, clause=clause)

    def are(n: int) -> str:
        return "is" if n == 1 else "are"

    if here:
        return pillar("weak", f"{here} restricted where you live",
                      "Banned or not authorised by the regulator for this kind of product.",
                      f"{_plural(here, 'ingredient')} {are(here)} restricted where you live"), reviewed
    if risks:
        return pillar("moderate", f"{_plural(len(risks), 'documented risk')}",
                      f"{_join(risks[:3])}. The studies support a risk, often at high intakes or for some people.",
                      f"{_list([r.lower() for r in risks[:2]])} {'has a' if len(risks) == 1 else 'have'} documented risk{'' if len(risks) == 1 else 's'}"
                      if len(risks) <= 2 else f"{len(risks)} ingredients have documented risks"), reviewed
    if elsewhere:
        return pillar("moderate", f"{elsewhere} restricted elsewhere",
                      "Allowed where you live, restricted by another regulator.",
                      f"{_plural(elsewhere, 'ingredient')} {are(elsewhere)} restricted in another country"), reviewed
    if cautions:
        return pillar("neutral", f"{_plural(len(cautions), 'possible risk')}",
                      f"{_join(cautions[:3])}. Early or conflicting evidence, not established."), reviewed
    if not reviewed:
        return pillar("neutral", "Not reviewed yet", "None of these ingredients are in our research library yet."), reviewed
    if reviewed * 2 >= total:
        return pillar("good", "Nothing flagged", _reviewed(reviewed, total), "nothing is flagged in the ingredients"), reviewed
    return pillar("neutral", "Mostly unreviewed",
                  f"{reviewed} of {total} ingredients reviewed so far; nothing flagged in those."), reviewed


# ─── Skin pillars (cosmetics) ─────────────────────────────────────────────────

_BASE_ACTIVES = {"Glycerin"}  # in nearly every cream: real, but not a reason to buy one


def _sun_pillar(skin: Any | None) -> VerdictPillar | None:
    sun = getattr(skin, "sun", None)
    if sun is None:
        return None
    clause = {"Broad-spectrum": "its sunscreen filters cover UVB and long UVA",
              "Mostly UVB": "its filters cover mostly UVB, not long UVA",
              "UVA cover may fade": "its only long-UVA filter isn’t stabilised"}.get(sun.verdict, "")
    return VerdictPillar(key="sun", label="Sun protection", tone=sun.tone, verdict=sun.verdict,
                         detail=f"{_list([f.name for f in sun.filters[:4]])}.", clause=clause)


def _actives_pillar(skin: Any | None) -> VerdictPillar | None:
    actives = list(getattr(skin, "actives", None) or [])
    if not actives:
        return None
    proven = [a for a in actives if a.tone == "good" and a.name not in _BASE_ACTIVES]
    working = [a for a in proven if not a.likely_low]
    low = [a for a in proven if a.likely_low]

    def pillar(tone: Tone, verdict: str, detail: str, clause: str = "") -> VerdictPillar:
        return VerdictPillar(key="actives", label="Actives", tone=tone, verdict=verdict, detail=detail, clause=clause)

    if working:
        names = [a.name for a in working[:3]]
        detail = f"{_join(names)}: tested in controlled trials."
        if low:
            lows = [a.name for a in low[:2]]
            detail += f" {_join(lows)} {'is' if len(lows) == 1 else 'are'} likely below the strength studied."
        return pillar("good", "Backed by trials", detail,
                      f"{_list([n.lower() for n in names[:2]])} {'is' if len(names) == 1 else 'are'} backed by trials")
    if low:
        first = low[0]
        return pillar("moderate", "Actives likely too low",
                      f"{first.name} is listed after the 1 % line; trials used {first.studied}.",
                      f"its {first.name.lower()} is likely below the strength studied")
    thin = [a for a in actives if a.name not in _BASE_ACTIVES]
    if not thin:
        return pillar("neutral", "Hydrating base", "Glycerin, a well-proven moisturiser, near the top of the label.")
    return pillar("neutral", "Little evidence behind its actives",
                  f"{_join([a.name for a in thin[:3]])}: early or little evidence in people.")


def _reactions_pillar(skin: Any | None) -> VerdictPillar | None:
    if skin is None:
        return None
    flags = list(skin.flags or [])
    leave_on = skin.use == "leave-on"

    def pillar(tone: Tone, verdict: str, detail: str, clause: str = "") -> VerdictPillar:
        return VerdictPillar(key="reactions", label="Skin reactions", tone=tone, verdict=verdict, detail=detail, clause=clause)

    frequent = [f for f in flags if f.kind == "frequent" and f.name != "Fragrance"]
    banned = [f for f in frequent if f.name in ("Methylisothiazolinone", "Methylchloroisothiazolinone")]
    if banned and leave_on:
        return pillar("weak", "Preservative banned in EU leave-ons",
                      f"{banned[0].name}: {banned[0].note}",
                      f"it contains {banned[0].name.lower()}, banned in EU leave-on products")
    if frequent:
        names = [f.name for f in frequent[:2]]
        tone: Tone = "moderate" if leave_on else "neutral"
        return pillar(tone, f"{_plural(len(frequent), 'common allergen')}",
                      f"{_join(names)}. Among the allergies dermatologists see most"
                      f"{'' if leave_on else '; rinsing off lowers the exposure'}.",
                      f"it contains {_list([n.lower() for n in names])}, a common skin allergen" if len(names) == 1
                      else "it contains common skin allergens")
    harsh = [f for f in flags if f.kind == "irritant" and f.name == "Sodium lauryl sulfate"]
    if harsh and leave_on:
        return pillar("moderate", "Harsh cleanser left on skin", harsh[0].note,
                      "it leaves sodium lauryl sulfate on the skin")
    scent = [f for f in flags if f.name == "Fragrance" or f.kind == "listed"]
    if scent:
        listed = [f for f in scent if f.kind == "listed"]
        detail = ("Contains fragrance" + (f" and {_plural(len(listed), 'labelled allergen')}" if listed else "")
                  + ". Fine for most people; worth avoiding with sensitive or eczema-prone skin.")
        return pillar("neutral", "Fragranced", detail, "it is fragranced")
    total = len(skin.roles) or 1
    detail = f"None of the {skin.checked_allergens} allergens and irritants we check, from patch-test clinic data."
    if skin.recognised * 10 < total * 7:
        # Too much of the label is unfamiliar to call it clean.
        return pillar("neutral", "None we recognise",
                      f"{detail} We recognise {skin.recognised} of {len(skin.roles)} ingredients so far.")
    return pillar("good", "No common allergens", detail, "it is free of the common skin allergens")


def build_product_verdict(response: Any) -> ProductVerdict:
    """The product's verdict from its own response: label measures, claims and rules."""
    category = getattr(response.category, "value", response.category)
    rows = [r for r in response.ingredients if not r.is_nutrient]
    ingredients, reviewed = _ingredients_pillar(rows, response.rule_extras, response.rules_glance)

    candidates: list[VerdictPillar | None]
    if category == "food":
        candidates = [_nutrition_pillar(response.nutrition, getattr(response, "high_per_100g", None)), _processing_pillar(response.processing), ingredients]
    elif category == "supplement":
        candidates = [_dose_pillar(response.doses), _evidence_pillar(rows), ingredients]
    elif getattr(response, "skin", None) is not None:
        skin = response.skin
        actives = _actives_pillar(skin)
        # The skin checks already read the label; "not reviewed yet" adds nothing beside them.
        if ingredients is not None and ingredients.tone == "neutral" and ingredients.verdict in ("Not reviewed yet", "Mostly unreviewed"):
            ingredients = None
        candidates = [_sun_pillar(skin), actives or _evidence_pillar(rows), _reactions_pillar(skin), ingredients]
    else:
        candidates = [ingredients, _evidence_pillar(rows)]
    pillars = [p for p in candidates if p is not None]

    weak = [p for p in pillars if p.tone == "weak"]
    moderate = [p for p in pillars if p.tone == "moderate"]
    good = [p for p in pillars if p.tone == "good"]
    level: Level
    if len(weak) >= 2:
        level = "poor"
    elif weak or len(moderate) >= 2:
        level = "mixed"
    elif good:
        level = "good"
    elif moderate:
        level = "mixed"
    else:
        level = "unknown"
    headline, tone = _HEADLINES[level]

    def series(items: list[str]) -> str:
        # An Oxford comma keeps "sugar and saturated fat, and ultra-processed" readable.
        if len(items) > 2 or (len(items) == 2 and " and " in items[0]):
            return f"{', '.join(items[:-1])}, and {items[-1]}"
        return _list(items)

    def sentence(pillars_: list[VerdictPillar]) -> str:
        """"It is high in sugar and ultra-processed. Sugar has a documented risk." """
        clauses = [p.clause for p in pillars_ if p.clause]
        about_it = [c.removeprefix("it is ") for c in clauses if c.startswith("it is ")]
        others = [c for c in clauses if not c.startswith("it is ")]
        parts = [f"It is {series(about_it)}"] if about_it else []
        if others:
            rest = series(others)
            parts.append(rest[0].upper() + rest[1:])
        return " ".join(f"{p}." for p in parts)

    if level == "unknown":
        summary = ("We don’t have enough label data or reviewed ingredients to judge this product. "
                   "What we do know is below.")
    elif level == "good":
        summary = sentence(good[:3])
        aside = next((p for p in moderate + [p for p in pillars if p.tone == "neutral"] if p.clause), None)
        if aside:
            summary += f" Worth knowing: {aside.clause}."
    else:
        summary = sentence((weak + moderate)[:3])
        if good:
            summary += f" On the plus side, {good[0].clause}."

    sources = [p.label.lower() for p in pillars if p.tone != "neutral"]
    basis = (f"Based on {_join(sources)}" if sources else "Nothing to base a verdict on yet")
    skin = getattr(response, "skin", None)
    if rows and skin is not None:
        basis += f" · {skin.recognised} of {_plural(len(rows), 'ingredient')} recognised"
    elif rows:
        basis += f" · {reviewed} of {_plural(len(rows), 'ingredient')} reviewed"

    return ProductVerdict(
        level=level, tone=tone, headline=headline, summary=summary, pillars=pillars,
        reviewed_count=reviewed, ingredient_count=len(rows), basis=basis,
    )
