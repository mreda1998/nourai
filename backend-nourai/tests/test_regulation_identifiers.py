"""E-numbers and label names reduce to the keys substances are matched on."""
from app.services.regulation.identifiers import alias_key, normalize_e_number


def test_normalize_e_number_examples():
    assert normalize_e_number("en:e171") == "E171"
    assert normalize_e_number("E 150a") == "E150A"
    assert normalize_e_number("e322(i)") == "E322I"
    assert normalize_e_number("INS 102") == "E102"
    assert normalize_e_number("sugar") is None


def test_function_prefix_stripped():
    assert alias_key("Colour: titanium dioxide", "name") == alias_key("titanium dioxide", "name")
    assert alias_key("émulsifiant : lécithine de soja", "name") == alias_key("lécithine de soja", "name")
    # Only a prefix followed by a colon is stripped.
    assert alias_key("Colourless water", "name") != alias_key("less water", "name")


def test_e_number_alias_key():
    assert alias_key("E 171", "e_number") == "E171"


def test_e_number_ranges_are_not_e_numbers():
    assert normalize_e_number("E150a-d") is None
    assert normalize_e_number("E 160a / E 160b") is None
