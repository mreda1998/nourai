"""EU cosmetics annexes (CosIng exports) become banned / allowed-with-limits cosmetic rules."""
from pathlib import Path

from app.services.regulation.sources.eu_cosing import COSING_SOURCES

FIXTURES = Path(__file__).parent / "fixtures" / "regulation"


def _parse(annex: str):
    return COSING_SOURCES[annex].parse((FIXTURES / f"eu-cosing-{annex.lower()}.csv").read_bytes())


def _rule(parsed, ref):
    return next(r for r in parsed.rules if r.row_ref.endswith(f"entry {ref}"))


def _substance(parsed, key):
    return next(s for s in parsed.substances if s.key == key)


def test_annex_ii_lilial_banned():
    parsed = _parse("II")
    assert (parsed.place, parsed.applies_to, parsed.semantics) == ("EU", "cosmetic", "negative")
    rule = _rule(parsed, "1666")
    assert rule.status == "banned" and rule.applies_to == "cosmetic" and rule.place == "EU"
    assert rule.legal_reference == (
        "Regulation (EC) No 1223/2009, Annex II, entry 1666 (as amended by Regulation (EU) 2021/1902)"
    )
    assert rule.source_url == "https://ec.europa.eu/growth/tools-databases/cosing/reference/annexes/list/II"
    lilial = _substance(parsed, "II/1666")
    assert lilial.cas == "80-54-6"
    assert ("BUTYLPHENYL METHYLPROPIONAL", "inci", "") in lilial.aliases


def test_annex_ii_exception_kept_as_condition():
    rule = _rule(_parse("II"), "1339")
    assert rule.status == "banned"
    assert "with the exception of entry 14" in rule.condition


def test_annex_iii_linalool_labelling_duty():
    rule = _rule(_parse("III"), "84")
    assert rule.status == "allowed_with_limits"
    assert "must be indicated in the list of ingredients" in rule.condition


def test_annex_iii_retinol_limits():
    parsed = _parse("III")
    rule = _rule(parsed, "376")
    assert rule.status == "allowed_with_limits"
    assert "Body lotion" in rule.sub_scope
    assert "0,05 % Retinol Equivalent" in rule.condition
    retinol = _substance(parsed, "III/376")
    assert retinol.cas is None  # several CAS numbers: none is picked
    assert ("Retinyl Palmitate", "inci", "") in retinol.group_aliases


def test_annex_v_preservatives():
    parsed = _parse("V")
    phenoxy = _rule(parsed, "29")
    assert phenoxy.status == "allowed_with_limits"
    assert phenoxy.condition.startswith("Maximum concentration: 1.0%")
    parabens = _substance(parsed, "V/12 a")
    assert ("PROPYLPARABEN", "inci", "") in parabens.group_aliases
    assert _rule(parsed, "12 a").legal_reference.startswith("Regulation (EC) No 1223/2009, Annex V, entry 12 a")



def test_group_member_names_are_not_approved_aliases():
    parabens = _substance(_parse("V"), "V/12 a")
    assert ("PROPYLPARABEN", "inci", "") not in parabens.aliases
    assert ("PROPYLPARABEN", "inci", "") in parabens.group_aliases
