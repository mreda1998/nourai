"""
Measures: a label amount placed against a cited reference.

One shape (`Measure`) backs every bar in the app — nutrients against daily
references, supplement doses against the daily value / upper limit or the
studied range, and lab contaminants against regulatory limits. The server
does all the maths (percent, band, zones, wording) so the client only draws.
Pure functions, no I/O.
"""
import re
from collections.abc import Iterable

from app.core.references import (
    FDA_5_20,
    FDA_DV,
    MICRONUTRIENT_REFERENCES,
    NOVA,
    NOVA_LABELS,
    NUTRIENT_REFERENCES,
    RESEARCH_LIBRARY,
    MicronutrientReference,
    NutrientReference,
    nih_ods,
)
from app.schemas.measure import (
    AdditiveItem,
    AdditivesSummary,
    Measure,
    MeasureScale,
    MeasureSource,
    MeasureTick,
    MeasureZone,
    NutritionPanel,
    ProcessingInfo,
)

# ─── Parsing & units ──────────────────────────────────────────────────────────

_NUMBER = r"(\d[\d,]*(?:\.\d+)?)"
_UNIT = r"(mcg|µg|ug|mg|g|iu|kcal|cfu|%)"
_MULTIPLIER = r"(?:\s*(billion|million))?"
_QUANTITY_RE = re.compile(rf"^\s*{_NUMBER}{_MULTIPLIER}\s*{_UNIT}(?![a-z/])", re.IGNORECASE)
_RANGE_RE = re.compile(
    rf"{_NUMBER}\s*(?:–|—|-|to)\s*{_NUMBER}{_MULTIPLIER}\s*{_UNIT}(?![a-z/])", re.IGNORECASE,
)
_MULTIPLIERS = {"billion": 1e9, "million": 1e6}
_MASS = {"g": 1.0, "mg": 1e-3, "mcg": 1e-6}
_IU_PER_MCG = {"vitamin_d": 40.0}  # the only IU conversion that doesn't depend on chemical form
_DISPLAY_UNITS = {"iu": "IU", "cfu": "CFU"}


def _num(text: str) -> float:
    return float(text.replace(",", ""))


def _unit(text: str) -> str:
    u = text.lower()
    return "mcg" if u in ("µg", "ug") else u


def parse_quantity(text: str | None) -> tuple[float, str] | None:
    """'330mg DHA' → (330.0, 'mg'). None when the text has no leading amount."""
    if not text:
        return None
    m = _QUANTITY_RE.match(text)
    if not m:
        return None
    value = _num(m.group(1)) * _MULTIPLIERS.get((m.group(2) or "").lower(), 1)
    return value, _unit(m.group(3))


def parse_range(text: str | None) -> tuple[float, float, str] | None:
    """'1–4g EPA+DHA daily' → (1.0, 4.0, 'g'). Per-body-weight doses are not ranges."""
    if not text:
        return None
    m = _RANGE_RE.search(text)
    if not m:
        return None
    mult = _MULTIPLIERS.get((m.group(3) or "").lower(), 1)
    return _num(m.group(1)) * mult, _num(m.group(2)) * mult, _unit(m.group(4))


def convert_amount(value: float, from_unit: str, to_unit: str, nutrient: str | None = None) -> float | None:
    """Convert between mass units (and IU for vitamin D). None when not convertible."""
    f, t = _unit(from_unit), _unit(to_unit)
    if f == t:
        return value
    iu = _IU_PER_MCG.get(nutrient or "")
    if iu and "iu" in (f, t):
        if f == "iu" and t in _MASS:
            return round(value / iu * _MASS["mcg"] / _MASS[t], 6)
        if t == "iu" and f in _MASS:
            return round(value * _MASS[f] / _MASS["mcg"] * iu, 6)
        return None
    if f in _MASS and t in _MASS:
        return round(value * _MASS[f] / _MASS[t], 6)
    return None


def _concentration(unit: str) -> tuple[str, str] | None:
    u = unit.lower().replace(" ", "")
    if u == "ppm":
        return "mg", "kg"
    if u == "ppb":
        return "mcg", "kg"
    if "/" not in u:
        return None
    mass, per = u.split("/", 1)
    mass = _unit(mass)
    return (mass, per) if mass in _MASS else None


def _convert_concentration(value: float, from_unit: str, to_unit: str) -> float | None:
    if from_unit.strip().lower() == to_unit.strip().lower():
        return value
    f, t = _concentration(from_unit), _concentration(to_unit)
    if not f or not t or f[1] != t[1]:
        return None
    return convert_amount(value, f[0], t[0])


# ─── Formatting ───────────────────────────────────────────────────────────────

def fmt(value: float) -> str:
    """Human number: 2,300 · 240 · 2.5 · 0.24"""
    if value >= 1000:
        return f"{value:,.0f}"
    if value >= 10:
        return f"{value:.0f}"
    if value >= 1:
        return f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{value:.2f}".rstrip("0").rstrip(".") or "0"


def _display_unit(unit: str) -> str:
    return _DISPLAY_UNITS.get(unit, unit)


def _tick(value: float, unit: str) -> MeasureTick:
    return MeasureTick(value=value, label=f"{fmt(value)} {unit}" if value else "0")


def _position(value: float, top: float) -> float:
    return round(min(1.0, max(0.0, value / top)), 4) if top > 0 else 0.0


# ─── Nutrition panel ──────────────────────────────────────────────────────────

_LIMIT_TONES = {"low": "good", "moderate": "moderate", "high": "weak"}
_GOAL_TONES = {"high_source": "good", "good_source": "good", "low": "neutral"}


def _nutrient_value(nutriments: dict, key: str, basis: str, serving_quantity: float | None) -> float | None:
    def read(k: str) -> float | None:
        try:
            v = float(nutriments[k])
        except (KeyError, TypeError, ValueError):
            return None
        return v if v >= 0 else None

    if basis == "100g":
        return read(f"{key}_100g")
    v = read(f"{key}_serving")
    if v is None and serving_quantity:
        per_100 = read(f"{key}_100g")
        v = per_100 * serving_quantity / 100 if per_100 is not None else None
    return v


def _nutrient_measure(ref: NutrientReference, grams: float, basis: str) -> Measure:
    value = round(grams * ref.g_factor, 2)
    percent = round(value / ref.value * 100)
    if ref.kind == "limit":
        band = "low" if percent <= 5 else "high" if percent >= 20 else "moderate"
        tone = _LIMIT_TONES[band]
        verdict = {"low": f"Low in {ref.noun}", "moderate": f"Moderate {ref.noun}", "high": f"High in {ref.noun}"}[band]
    elif ref.kind == "goal":
        band = "high_source" if percent >= 20 else "good_source" if percent >= 10 else "low"
        tone = _GOAL_TONES[band]
        verdict = {
            "high_source": f"High in {ref.noun}",
            "good_source": f"Good source of {ref.noun}",
            "low": f"Some {ref.noun}" if value > 0 else f"No {ref.noun}",
        }[band]
    else:
        band, tone, verdict = "neutral", "neutral", f"{percent}% of daily {ref.noun}"

    source_name, source_url = ref.source
    subject = f"{fmt(value)} kcal" if ref.unit == "kcal" else f"{fmt(value)} {ref.unit} of {ref.noun}"
    per = "per serving" if basis == "serving" else "per 100 g"
    sources = [MeasureSource(name=source_name, url=source_url, detail=f"{fmt(ref.value)} {ref.unit} a day")]
    if ref.kind != "reference":
        sources.append(MeasureSource(name=FDA_5_20[0], url=FDA_5_20[1], detail="5% or less is low, 20% or more is high"))

    return Measure(
        key=ref.off_key,
        label=ref.label,
        kind=ref.kind,
        value=value,
        unit=ref.unit,
        display_value=fmt(value),
        percent=percent,
        position=_position(value, ref.value),
        band=band,
        tone=tone,
        verdict=verdict,
        sentence=f"{subject} is {percent}% of the {source_name} {per}.",
        panel_label=ref.panel_label,
        scale=MeasureScale(
            max=ref.value,
            ticks=[_tick(0, ref.unit), _tick(ref.value / 2, ref.unit), _tick(ref.value, ref.unit)],
        ),
        sources=sources,
    )


def build_nutrition_panel(
    nutriments: dict | None,
    serving_quantity: float | None,
    serving_size: str | None,
) -> NutritionPanel | None:
    """Nutrition facts as measures — per serving when the label allows, else per 100 g."""
    nutriments = nutriments or {}
    try:
        qty = float(serving_quantity) if serving_quantity else None
    except (TypeError, ValueError):
        qty = None
    has_serving = any(f"{r.off_key}_serving" in nutriments for r in NUTRIENT_REFERENCES)
    basis = "serving" if has_serving or (qty and qty > 0) else "100g"

    measures = []
    for ref in NUTRIENT_REFERENCES:
        grams = _nutrient_value(nutriments, ref.off_key, basis, qty)
        if grams is not None:
            measures.append(_nutrient_measure(ref, grams, basis))
    if not measures:
        return None

    if basis == "100g":
        label = "100 g"
    else:
        label = serving_size or (f"{fmt(qty)} g" if qty else "1 serving")
    return NutritionPanel(basis=basis, serving_label=label, measures=measures)


# ─── Doses ────────────────────────────────────────────────────────────────────

def _match_micronutrient(*names: str | None) -> MicronutrientReference | None:
    for name in names:
        if not name:
            continue
        lowered = name.lower()
        for ref in MICRONUTRIENT_REFERENCES:
            if re.search(ref.pattern, lowered):
                return ref
    return None


def _daily_value_measure(
    label: str, value: float, unit: str, ref: MicronutrientReference,
    dv: float, ul: float | None, ingredient_id: str | None,
) -> Measure:
    shown = _display_unit(unit)
    percent = round(value / dv * 100)
    if ul is not None and value > ul:
        band, tone, verdict = "over_ul", "weak", "Above the upper limit"
    elif value >= dv:
        band, tone, verdict = "in_range", "good", "Meets the daily value"
    else:
        band, tone, verdict = "under", "neutral", f"{percent}% of the daily value"

    top = max(ul or 0, dv if ul else dv * 2, value) * 1.2
    if ul is None:
        zones = [MeasureZone(start=0, end=dv, tone="neutral"), MeasureZone(start=dv, end=top, tone="good")]
    elif ul >= dv:
        zones = [
            MeasureZone(start=0, end=dv, tone="neutral"),
            MeasureZone(start=dv, end=ul, tone="good"),
            MeasureZone(start=ul, end=top, tone="weak"),
        ]
    else:  # supplemental upper limit below the all-sources daily value (magnesium)
        zones = [MeasureZone(start=0, end=ul, tone="neutral"), MeasureZone(start=ul, end=top, tone="weak")]
    ticks = sorted({0, dv, *([ul] if ul is not None else [])})

    note = f" ({ref.ul_note})" if ref.ul_note else ""
    tail = f"; the NIH upper limit{note} is {fmt(ul)} {shown}." if ul is not None else ". No upper limit has been set."
    return Measure(
        key=ref.key,
        label=label,
        kind="dose",
        value=value,
        unit=shown,
        display_value=fmt(value),
        percent=percent,
        position=_position(value, top),
        band=band,
        tone=tone,
        verdict=verdict,
        sentence=f"{fmt(value)} {shown} is {percent}% of the FDA Daily Value{tail}",
        panel_label="Dose vs daily value",
        scale=MeasureScale(max=round(top, 6), ticks=[_tick(t, shown) for t in ticks], zones=zones),
        sources=[
            MeasureSource(name=FDA_DV[0], url=FDA_DV[1], detail=f"{fmt(dv)} {shown} a day"),
            MeasureSource(
                name="NIH Office of Dietary Supplements",
                url=nih_ods(ref.sheet),
                detail=f"Upper limit {fmt(ul)} {shown}{note}" if ul is not None else "No upper limit established",
            ),
        ],
        ingredient_id=ingredient_id,
    )


def _studied_range_measure(
    label: str, key: str, value: float, unit: str, low: float, high: float,
    range_text: str, ingredient_id: str | None,
) -> Measure:
    shown = _display_unit(unit)
    if value < low:
        band, tone, verdict = "under", "moderate", "Below the studied range"
    elif value > high:
        band, tone, verdict = "over", "moderate", "Above the studied range"
    else:
        band, tone, verdict = "in_range", "good", "Within the studied range"
    top = max(high, value) * 1.25
    return Measure(
        key=key,
        label=label,
        kind="dose",
        value=value,
        unit=shown,
        display_value=fmt(value),
        percent=None,
        position=_position(value, top),
        band=band,
        tone=tone,
        verdict=verdict,
        sentence=f"{fmt(value)} {shown} per serving, against a studied range of {fmt(low)}–{fmt(high)} {shown}.",
        panel_label="Dose vs studied range",
        scale=MeasureScale(
            max=round(top, 6),
            ticks=[_tick(0, shown), _tick(low, shown), _tick(high, shown)],
            zones=[
                MeasureZone(start=0, end=low, tone="neutral"),
                MeasureZone(start=low, end=high, tone="good"),
                MeasureZone(start=high, end=top, tone="moderate"),
            ],
        ),
        sources=[MeasureSource(name=RESEARCH_LIBRARY, detail=range_text)],
        ingredient_id=ingredient_id,
    )


def build_dose_measure(
    name: str,
    amount_text: str | None,
    canonical_name: str | None = None,
    typical_dose_range: str | None = None,
    ingredient_id: str | None = None,
) -> Measure | None:
    """A supplement ingredient's label dose against the DV/UL (vitamins & minerals) or its studied range."""
    quantity = parse_quantity(amount_text)
    if not quantity:
        return None
    value, unit = quantity
    label = canonical_name or name

    ref = _match_micronutrient(canonical_name, name)
    if ref:
        dv = convert_amount(ref.dv, ref.unit, unit, ref.key)
        ul = convert_amount(ref.ul, ref.unit, unit, ref.key) if ref.ul is not None else None
        if dv:
            return _daily_value_measure(label, value, unit, ref, dv, ul, ingredient_id)

    studied = parse_range(typical_dose_range)
    if studied:
        low, high, range_unit = studied
        nutrient = ref.key if ref else None
        low_c = convert_amount(low, range_unit, unit, nutrient)
        high_c = convert_amount(high, range_unit, unit, nutrient)
        if low_c is not None and high_c is not None and high_c > 0:
            key = ref.key if ref else re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
            return _studied_range_measure(label, key, value, unit, low_c, high_c, typical_dose_range or "", ingredient_id)
    return None


# ─── Contaminants ─────────────────────────────────────────────────────────────

_NOT_DETECTED = {"not_detected", "nd", "below_lod", "below_loq"}


def build_contaminant_measure(
    analyte: str,
    value: float | None,
    unit: str,
    detection_status: str | None,
    threshold_value: float | None,
    threshold_unit: str | None,
    threshold_name: str | None,
    threshold_source_url: str | None,
) -> Measure | None:
    """A lab measurement against the regulatory threshold recorded with it."""
    if threshold_value is None or not threshold_unit or threshold_value <= 0:
        return None
    limit_name = threshold_name or "regulatory limit"
    not_detected = (detection_status or "").lower() in _NOT_DETECTED
    if not_detected:
        measured = 0.0
    elif value is None:
        return None
    else:
        measured = _convert_concentration(value, unit, threshold_unit)
        if measured is None:
            return None

    percent = round(measured / threshold_value * 100)
    above = measured > threshold_value
    top = max(threshold_value, measured) * 1.25
    if not_detected:
        verdict, sentence = "Not detected", f"Not detected; the {limit_name} is {fmt(threshold_value)} {threshold_unit}."
    else:
        verdict = "Above the limit" if above else "Below the limit"
        sentence = f"{fmt(measured)} {threshold_unit} measured; the {limit_name} is {fmt(threshold_value)} {threshold_unit}."
    return Measure(
        key=f"lab:{analyte.lower()}",
        label=analyte,
        kind="contaminant",
        value=measured,
        unit=threshold_unit,
        display_value="ND" if not_detected else fmt(measured),
        percent=percent,
        position=_position(measured, top),
        band="above_limit" if above else "below_limit",
        tone="weak" if above else "good",
        verdict=verdict,
        sentence=sentence,
        panel_label=f"Measured vs {limit_name}",
        scale=MeasureScale(
            max=round(top, 6),
            ticks=[_tick(0, threshold_unit), _tick(threshold_value, threshold_unit)],
            zones=[
                MeasureZone(start=0, end=threshold_value, tone="good"),
                MeasureZone(start=threshold_value, end=top, tone="weak"),
            ],
        ),
        sources=[MeasureSource(name=threshold_name or "Regulatory limit", url=threshold_source_url)],
    )


def measure_for_lab_observation(observation, interpretations: Iterable) -> Measure | None:
    """The observation's bar, against the first interpretation that records a threshold."""
    for item in interpretations:
        if item.threshold_value is not None and item.threshold_unit:
            return build_contaminant_measure(
                analyte=observation.analyte_name,
                value=observation.value,
                unit=observation.unit,
                detection_status=observation.detection_status,
                threshold_value=item.threshold_value,
                threshold_unit=item.threshold_unit,
                threshold_name=item.threshold_name,
                threshold_source_url=item.threshold_source_url,
            )
    return None


# ─── Processing & additives ───────────────────────────────────────────────────

def build_processing(extra_data: dict | None) -> ProcessingInfo | None:
    """NOVA group (1–4) as a position on the unprocessed → ultra-processed scale."""
    try:
        group = int((extra_data or {}).get("nova_group"))
    except (TypeError, ValueError):
        return None
    if group not in NOVA_LABELS:
        return None
    return ProcessingInfo(
        nova_group=group,
        label=NOVA_LABELS[group],
        position=round((group - 1) / 3, 4),
        tone="good" if group <= 2 else "moderate" if group == 3 else "weak",
        source=MeasureSource(name=NOVA[0], url=NOVA[1]),
    )


_REASONS = {"additive": "Additive", "preservative": "Preservative", "sweetener": "Sweetener"}


def _value(x) -> str | None:
    return getattr(x, "value", x)


def build_additives_summary(rows: Iterable) -> AdditivesSummary:
    """
    Tier the ingredients we actually know. Only rows matched to the research
    library are judged; unmatched rows default to 'watch' at ingestion, so
    they are counted as unreviewed instead of flagged.
    """
    avoid: list[AdditiveItem] = []
    watch: list[AdditiveItem] = []
    clean = unreviewed = 0
    seen: set[str] = set()
    for row in rows:
        if not row.ingredient_id:
            unreviewed += 1
            continue
        key = str(row.ingredient_id)
        if key in seen:
            continue
        seen.add(key)
        status = _value(row.status)
        canonical = getattr(row, "ingredient", None)
        if status not in ("avoid", "watch"):
            clean += 1
            continue
        reason = row.note or _REASONS.get(_value(getattr(canonical, "category", None)) or "")
        if not reason and getattr(canonical, "contraindications", None):
            reason = "Has known contraindications"
        item = AdditiveItem(
            name=getattr(canonical, "canonical_name", None) or row.name,
            ingredient_id=key,
            reason=reason,
        )
        (avoid if status == "avoid" else watch).append(item)
    return AdditivesSummary(avoid=avoid, watch=watch, clean_count=clean, unreviewed_count=unreviewed)
