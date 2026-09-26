from app.services.identity.clean import clean_name


def test_basic_normalisation():
    assert clean_name("  Sucre. ").normalized == "sucre"


def test_allergen_markup_is_removed():
    assert clean_name("Isolate De _Lait_ Hydrolisé").normalized == "isolate de lait hydrolisé"


def test_e_number_prefix_is_split_off():
    c = clean_name("E330 - Acide citrique")
    assert c.normalized == "acide citrique" and c.e_number == "e330"
    assert clean_name("E575").e_number == "e575"


def test_nutrition_fragments_and_headings_are_junk():
    assert clean_name("Dont Acides Gras 7.0G Saturés").junk
    assert clean_name("Ingredients").junk
    assert clean_name("12%").junk
    assert not clean_name("Vitamin B12").junk


def test_plural_offers_a_singular_form():
    assert clean_name("Arômes Naturels").singular == "arôme naturel"
    assert clean_name("Huiles Végétales").singular == "huile végétale"
    assert clean_name("Glass").singular is None  # not a plural
