from app.services.molecule import MAX_HEAVY_ATOMS, molecule_facts, render_molecule_svg

CREATINE = "NC(=N)N(C)CC(=O)O"


def test_renders_a_clean_svg_in_elory_colours():
    svg = render_molecule_svg(CREATINE)
    assert svg.startswith("<svg") and "<?xml" not in svg
    assert "#0F5652" in svg.upper()  # nitrogen in Elory teal
    assert "#BE5B3B" in svg.upper()  # oxygen in terracotta
    assert "<rect" not in svg  # transparent: no background box


def test_invalid_smiles_gives_nothing():
    assert render_molecule_svg("not a molecule") is None


def test_very_large_molecules_are_not_drawn():
    assert render_molecule_svg("C" * (MAX_HEAVY_ATOMS + 1)) is None


def test_formula_and_mass():
    facts = molecule_facts(CREATINE)
    assert facts == {"formula": "C4H9N3O2", "mass": 131.13}
