"""Ingredient statement parsing that preserves order and nested compounds."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.services.ingestion.normalization import normalize_ingredient_alias


_LANGUAGE_PREFIX = re.compile(r"^_[a-z]{2,3}:")
_PERCENTAGE = re.compile(r"(?:^|\s)(\d+(?:\.\d+)?)\s*%")


@dataclass(slots=True)
class ParsedIngredient:
    raw_text: str
    normalized_text: str
    order_path: str
    parent_path: str | None = None
    percentage: float | None = None
    qualifiers: dict[str, Any] = field(default_factory=dict)


def parse_off_ingredients(product: dict[str, Any]) -> list[ParsedIngredient]:
    """Prefer OFF's structured tree; fall back to a balanced text parser."""
    structured = product.get("ingredients")
    if isinstance(structured, list) and structured:
        parsed: list[ParsedIngredient] = []
        _walk_structured(structured, parsed, parent_path=None, prefix="")
        if parsed:
            return parsed

    statement = (
        product.get("ingredients_text_en")
        or product.get("ingredients_text")
        or ""
    )
    if not isinstance(statement, str) or not statement.strip():
        return []
    return _parse_text_level(statement)


def _walk_structured(
    items: list[Any],
    output: list[ParsedIngredient],
    *,
    parent_path: str | None,
    prefix: str,
) -> None:
    for position, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            continue
        path = f"{prefix}.{position}" if prefix else str(position)
        raw = str(item.get("text") or item.get("id") or "").strip()
        raw = _LANGUAGE_PREFIX.sub("", raw)
        normalized = normalize_ingredient_alias(raw)
        if not normalized:
            continue
        percentage = _as_float(
            item.get("percent")
            or item.get("percent_estimate")
            or item.get("percent_max")
        )
        qualifiers = {
            key: item[key]
            for key in ("vegan", "vegetarian", "percent_min", "percent_max")
            if item.get(key) is not None
        }
        output.append(
            ParsedIngredient(
                raw_text=raw,
                normalized_text=normalized,
                order_path=path,
                parent_path=parent_path,
                percentage=percentage,
                qualifiers=qualifiers,
            )
        )
        children = item.get("ingredients")
        if isinstance(children, list) and children:
            _walk_structured(children, output, parent_path=path, prefix=path)


def _parse_text_level(
    text: str,
    *,
    parent_path: str | None = None,
    prefix: str = "",
) -> list[ParsedIngredient]:
    output: list[ParsedIngredient] = []
    for position, token in enumerate(_split_balanced(text), start=1):
        path = f"{prefix}.{position}" if prefix else str(position)
        raw = token.strip().strip(".*†‡")
        if not raw:
            continue
        percentage = None
        match = _PERCENTAGE.search(raw)
        if match:
            percentage = float(match.group(1))

        head, inner = _outer_parenthetical(raw)
        name_for_resolution = _PERCENTAGE.sub(" ", head or raw)
        normalized = normalize_ingredient_alias(name_for_resolution)
        if not normalized:
            continue
        qualifiers: dict[str, Any] = {}
        inner_parts = _split_balanced(inner) if inner else []
        has_nested_list = len(inner_parts) > 1
        if inner and not has_nested_list:
            qualifiers["parenthetical"] = inner.strip()

        output.append(
            ParsedIngredient(
                raw_text=(head or raw).strip(),
                normalized_text=normalized,
                order_path=path,
                parent_path=parent_path,
                percentage=percentage,
                qualifiers=qualifiers,
            )
        )
        if has_nested_list:
            output.extend(
                _parse_text_level(inner, parent_path=path, prefix=path)
            )
    return output


def _split_balanced(text: str) -> list[str]:
    parts: list[str] = []
    start = 0
    stack: list[str] = []
    pairs = {")": "(", "]": "[", "}": "{"}
    for index, char in enumerate(text):
        if char in "([{":
            stack.append(char)
        elif char in pairs and stack and stack[-1] == pairs[char]:
            stack.pop()
        elif char in ",;" and not stack:
            parts.append(text[start:index])
            start = index + 1
    parts.append(text[start:])
    return [part for part in parts if part.strip()]


def _outer_parenthetical(value: str) -> tuple[str, str | None]:
    opening = value.find("(")
    if opening <= 0 or not value.endswith(")"):
        return value, None
    depth = 0
    for index in range(opening, len(value)):
        if value[index] == "(":
            depth += 1
        elif value[index] == ")":
            depth -= 1
            if depth == 0 and index != len(value) - 1:
                return value, None
    return value[:opening].strip(), value[opening + 1 : -1].strip()


def _as_float(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None
