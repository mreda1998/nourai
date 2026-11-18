"""
Stack review: what the research says about a set of products taken together.

Built only from researched claims and the labels themselves: which ingredients
have a benefit that holds up, which carry a documented risk, and which appear
in more than one product (the most common way a routine ends up over a limit).
No score. Pure over ProductIngredient rows, so it serves a signed-in stack and
a guest's on-device stack alike.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

from app.services.verdicts import ingredient_standing


class ReviewFinding(BaseModel):
    ingredient_id: str
    ingredient: str
    label: str               # "Probably works", "Likely risk"
    tone: Literal["good", "moderate", "weak", "neutral"]
    claim: str | None = None
    products: list[str]      # names of the stack products that contain it


class StackReview(BaseModel):
    supported: list[ReviewFinding]   # benefits that hold up, most certain first
    risks: list[ReviewFinding]       # documented, then possible
    overlaps: list[ReviewFinding]    # the same ingredient in two or more products
    product_count: int
    ingredient_count: int            # distinct label rows across the stack
    reviewed_count: int              # distinct researched ingredients among them


_TONE_ORDER = {"good": 0, "moderate": 1, "weak": 2, "neutral": 3}


def stack_review(product_ingredients: list[Any]) -> StackReview:
    by_ingredient: dict[str, dict[str, Any]] = {}
    products: set[str] = set()
    label_rows: set[tuple[str, str]] = set()

    for row in product_ingredients:
        product_id = str(row.product_id)
        products.add(product_id)
        label_rows.add((product_id, (row.name or "").strip().lower()))
        ingredient = getattr(row, "ingredient", None)
        if ingredient is None:
            continue
        entry = by_ingredient.setdefault(str(ingredient.id), {"ingredient": ingredient, "products": {}})
        product = getattr(row, "product", None)
        entry["products"][product_id] = getattr(product, "name", None) or "A product in your stack"

    supported: list[ReviewFinding] = []
    risks: list[ReviewFinding] = []
    overlaps: list[ReviewFinding] = []
    reviewed = 0
    for ingredient_id, entry in by_ingredient.items():
        ingredient = entry["ingredient"]
        names = sorted(entry["products"].values())
        standing = ingredient_standing(ingredient)
        if standing.level != "unreviewed":
            reviewed += 1

        def finding(label: str, tone: str, claim: str | None) -> ReviewFinding:
            return ReviewFinding(ingredient_id=ingredient_id, ingredient=ingredient.canonical_name,
                                 label=label, tone=tone, claim=claim, products=names)  # type: ignore[arg-type]

        if standing.benefit_label and standing.benefit_tone in ("good", "moderate"):
            supported.append(finding(standing.benefit_label, standing.benefit_tone, standing.benefit_note))
        if standing.level in ("risk", "caution") and standing.label:
            risks.append(finding(standing.label, "weak" if standing.level == "risk" else "moderate", standing.note))
        if len(names) > 1:
            overlaps.append(finding(f"In {len(names)} products", "neutral", None))

    supported.sort(key=lambda f: (_TONE_ORDER[f.tone], f.ingredient))
    risks.sort(key=lambda f: (-_TONE_ORDER[f.tone], f.ingredient))  # weak (documented) first
    overlaps.sort(key=lambda f: (-len(f.products), f.ingredient))

    return StackReview(
        supported=supported[:8], risks=risks[:8], overlaps=overlaps[:8],
        product_count=len(products), ingredient_count=len(label_rows), reviewed_count=reviewed,
    )
