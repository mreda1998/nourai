"""Health Canada's Cosmetic Ingredient Hotlist: prohibited → banned, restricted → allowed with limits."""
from pathlib import Path

from app.services.regulation.sources.ca_cosmetic_hotlist import SOURCE

RAW = (Path(__file__).parent / "fixtures" / "regulation" / "ca-cosmetic-hotlist.html").read_bytes()


def _by_name(parsed):
    names = {s.key: s for s in parsed.substances}
    return {names[r.substance_key].name: (names[r.substance_key], r) for r in parsed.rules}


def test_prohibited_mercury():
    parsed = SOURCE.parse(RAW)
    assert (parsed.place, parsed.applies_to, parsed.semantics) == ("CA", "cosmetic", "negative")
    substance, rule = _by_name(parsed)["Mercury and its compounds"]
    assert rule.status == "banned" and rule.place == "CA" and rule.applies_to == "cosmetic"
    assert rule.legal_reference == "Cosmetic Ingredient Hotlist (Health Canada), prohibited list"
    assert ("Phenyl mercuric acetate", "name", "en") in substance.aliases
    assert substance.cas is None  # several CAS numbers listed


def test_prohibited_single_cas_kept():
    substance, _ = _by_name(SOURCE.parse(RAW))["1,2-Epoxybutane"]
    assert substance.cas == "106-88-7"


def test_restricted_triclosan_conditions_by_product_type():
    substance, rule = _by_name(SOURCE.parse(RAW))["Triclosan"]
    assert rule.status == "allowed_with_limits"
    assert rule.condition.startswith("a) Mouthwashes — maximum 0.03%")
    assert "b)" in rule.condition and "c)" in rule.condition
    assert substance.cas == "3380-34-5"


def test_restricted_formaldehyde_keeps_every_condition():
    _, rule = _by_name(SOURCE.parse(RAW))["Formaldehyde"]
    assert rule.condition.startswith("a) Not permitted in aerosol products")
    assert "e)" in rule.condition
