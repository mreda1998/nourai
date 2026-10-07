"""A label value placed against a cited reference — the shape behind every bar."""
from typing import Literal

from pydantic import BaseModel

MeasureKind = Literal["limit", "goal", "reference", "dose", "contaminant"]
Tone = Literal["neutral", "good", "moderate", "weak"]


class MeasureTick(BaseModel):
    value: float
    label: str


class MeasureZone(BaseModel):
    start: float
    end: float
    tone: Tone


class MeasureScale(BaseModel):
    max: float
    ticks: list[MeasureTick]
    zones: list[MeasureZone] = []


class MeasureSource(BaseModel):
    name: str
    url: str | None = None
    detail: str | None = None


class Measure(BaseModel):
    key: str
    label: str
    kind: MeasureKind
    value: float
    unit: str
    display_value: str
    percent: int | None = None
    position: float               # 0–1 along the scale, clamped
    band: str
    tone: Tone
    verdict: str                  # "High in sodium", "Below the studied range"
    sentence: str                 # one plain-language line under the bar
    panel_label: str              # overline above the bar, e.g. "Daily sodium limit"
    scale: MeasureScale
    sources: list[MeasureSource]
    ingredient_id: str | None = None


class NutritionPanel(BaseModel):
    basis: Literal["serving", "100g"]
    serving_label: str
    measures: list[Measure]


class AdditiveItem(BaseModel):
    name: str
    ingredient_id: str | None = None
    reason: str | None = None


class AdditivesSummary(BaseModel):
    avoid: list[AdditiveItem]
    watch: list[AdditiveItem]
    clean_count: int
    unreviewed_count: int


class ProcessingInfo(BaseModel):
    nova_group: int
    label: str
    position: float
    tone: Tone
    source: MeasureSource
