"""Seeding the top ingredients: canonical rows, approved aliases, and links for products already scanned."""
import pytest
from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.ingestion import IngredientAlias
from app.models.ingredient import Ingredient
from app.models.product import Product, ProductIngredient
from scripts.seed_top_ingredients import seed

pytestmark = pytest.mark.anyio

SUGAR = {"canonical_name": "Sugar", "category": "sweetener", "aliases": ["sugar", "sucre", "Zucker", "cane sugar"]}
GLYCERIN = {"canonical_name": "Glycerin", "category": "other", "aliases": ["glycerin", "glycerol", "E422"]}


async def _scanned(names: list[str]):
    async with async_session_factory() as session:
        product = Product(name="Biscuits", category="food", extra_data={})
        session.add(product)
        await session.flush()
        session.add_all(ProductIngredient(product_id=product.id, name=n, order_position=i) for i, n in enumerate(names))
        await session.commit()


async def test_seeding_creates_pending_ingredients_aliases_and_links_scanned_products():
    await _scanned(["Sucre", "farine de blé", "Glycérol ", "e422", "Sugar 30%"])

    async with async_session_factory() as session:
        report = await seed(session, [SUGAR, GLYCERIN])
        await session.commit()

    async with async_session_factory() as session:
        ingredients = {i.canonical_name: i for i in (await session.execute(select(Ingredient))).scalars()}
        aliases = (await session.execute(select(IngredientAlias.normalized_alias))).scalars().all()
        links = dict((await session.execute(select(ProductIngredient.name, ProductIngredient.ingredient_id))).all())

    assert ingredients["Sugar"].research_status == "pending"
    assert ingredients["Sugar"].synonyms == ["sucre", "Zucker", "cane sugar"]
    assert {"sucre", "zucker", "e422", "glycerol"} <= set(aliases)
    assert links["Sucre"] == links["Sugar 30%"] == ingredients["Sugar"].id
    assert links["e422"] == ingredients["Glycerin"].id
    assert links["farine de blé"] is None  # not in the list
    assert report == {"ingredients_created": 2, "aliases_added": 7, "product_rows_linked": 3}


async def test_seeding_twice_changes_nothing_and_keeps_existing_research():
    async with async_session_factory() as session:
        await seed(session, [SUGAR])
        await session.commit()
    async with async_session_factory() as session:
        sugar = (await session.execute(select(Ingredient))).scalar_one()
        sugar.research_status = "complete"
        await session.commit()

    async with async_session_factory() as session:
        report = await seed(session, [SUGAR])
        await session.commit()
        sugar = (await session.execute(select(Ingredient))).scalar_one()

    assert report == {"ingredients_created": 0, "aliases_added": 0, "product_rows_linked": 0}
    assert sugar.research_status == "complete"
