import app.models  # noqa: F401
from app.db.base import Base


def test_identity_tables():
    for t in ("substances", "substance_aliases", "name_resolutions"):
        assert t in Base.metadata.tables
    cols = Base.metadata.tables["product_ingredients"].c
    assert "substance_id" in cols and "display_name" in cols
