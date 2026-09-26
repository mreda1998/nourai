"""
Build the substance catalogue from open taxonomies.

Sources, highest priority first when two claim the same spelling:
our library > Open Food Facts ingredients > OFF additives > CosIng.
Pure functions: parsing and priority are tested without a database.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.services.ingestion.normalization import normalize_ingredient_alias

OFF_LICENSE = "ODbL 1.0"
COSING_LICENSE = "EU open data"

# Group words that name a kind of ingredient rather than one substance.
CURATED_CLASS_KEYS = {
    "en:flavouring", "en:natural-flavouring", "en:artificial-flavouring", "en:vegetable-oil",
    "en:vegetable-fat", "en:vitamins", "en:minerals", "en:spice", "en:colour", "en:thickener",
    "en:sweetener", "en:herb", "en:plant-extract", "en:fragrance",
}

_E_PREFIX = re.compile(r"^e\s?\d{3,4}[a-z]?\s*[-–:]\s*", re.IGNORECASE)


@dataclass
class SubstanceSpec:
    key: str
    name_en: str
    type: str = "substance"
    e_number: str | None = None
    inci_name: str | None = None
    cas: str | None = None
    wikidata: str | None = None
    source: str = ""
    license: str | None = None
    ingredient_id: str | None = None
    aliases: list[tuple[str, str | None]] = field(default_factory=list)  # (alias, language)


def _first(d: dict | None, *langs: str) -> str | None:
    if not d:
        return None
    for lang in langs:
        if d.get(lang):
            return d[lang]
    return next(iter(d.values()), None)


def _clean_e_prefix(name: str) -> str:
    return _E_PREFIX.sub("", name).strip()


def parse_off(entries: dict, *, class_keys: set[str], source: str, strip_e_prefix: bool = False) -> list[SubstanceSpec]:
    specs = []
    for key, v in entries.items():
        names = v.get("name") or {}
        english = _first(names, "en", "fr") or key.split(":", 1)[-1].replace("-", " ")
        if strip_e_prefix:
            english = _clean_e_prefix(english) or english
        spec = SubstanceSpec(
            key=f"{'offadd' if strip_e_prefix else 'off'}:{key}",
            name_en=english[:1].upper() + english[1:],
            type="class" if key in class_keys else "substance",
            e_number=("e" + v["e_number"]["en"]) if (v.get("e_number") or {}).get("en") else None,
            wikidata=_first(v.get("wikidata"), "en"),
            source=source,
            license=OFF_LICENSE,
        )
        for lang, name in names.items():
            spec.aliases.append((_clean_e_prefix(name) if strip_e_prefix else name, lang))
        for lang, syns in (v.get("synonyms") or {}).items():
            spec.aliases.extend((_clean_e_prefix(s) if strip_e_prefix else s, lang) for s in syns)
        specs.append(spec)
    return specs


def parse_cosing(rows: list[list[str]]) -> list[SubstanceSpec]:
    """Rows of the CosIng inventory CSV: ref, INCI, INN, Ph.Eur., CAS, EC, description, restriction, function, date."""
    specs = []
    for r in rows:
        if len(r) < 9 or not r[0].strip().isdigit() or not r[1].strip():
            continue
        inci = " ".join(r[1].split())
        cas = r[4].strip().strip("-").strip() or None
        specs.append(SubstanceSpec(
            key=f"cosing:{r[0].strip()}", name_en=inci.title(), inci_name=inci, cas=cas,
            source="cosing", license=COSING_LICENSE, aliases=[(inci, "inci")],
        ))
    return specs


def build_catalog(
    off_ingredients: dict, off_additives: dict, off_classes: dict, cosing_rows: list[list[str]],
    library: list[dict],
) -> tuple[list[SubstanceSpec], dict[str, str]]:
    """
    Returns substances and the alias index {normalized alias: substance key}.
    Library ingredients link to the taxonomy substance their names resolve to;
    only when none matches does the library ingredient become its own substance.
    """
    class_keys = set(off_classes) | CURATED_CLASS_KEYS
    specs: dict[str, SubstanceSpec] = {}
    index: dict[str, str] = {}

    def claim(spec: SubstanceSpec, override: bool = False) -> None:
        specs.setdefault(spec.key, spec)
        for alias, _lang in spec.aliases:
            n = normalize_ingredient_alias(alias)
            if n and (override or n not in index):
                index[n] = spec.key

    for group in (
        parse_off(off_ingredients, class_keys=class_keys, source="off_ingredients"),
        parse_off(off_additives, class_keys=class_keys, source="off_additives", strip_e_prefix=True),
        parse_cosing(cosing_rows),
    ):
        for spec in group:
            claim(spec)

    for ing in library:
        names = [ing["canonical_name"], *(ing.get("synonyms") or [])]
        target = next((index[n] for n in map(normalize_ingredient_alias, names) if n in index), None)
        if target is None:
            spec = SubstanceSpec(key=f"lib:{ing['id']}", name_en=ing["canonical_name"], source="library",
                                 ingredient_id=str(ing["id"]))
            target = spec.key
            specs[spec.key] = spec
        elif specs[target].ingredient_id is None:
            specs[target].ingredient_id = str(ing["id"])
        specs[target].aliases.extend((n, None) for n in names)
        for n in map(normalize_ingredient_alias, names):
            if n:
                index[n] = target  # the library wins its own names
    return list(specs.values()), index
