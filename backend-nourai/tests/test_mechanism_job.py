from pathlib import Path

from app.services.mechanisms.clients import ReplayClients
from app.services.mechanisms.job import MAX_LOCATIONS, build_mechanism

FIX = Path(__file__).parent / "fixtures" / "mechanisms"


def recorded(slug: str) -> ReplayClients:
    return ReplayClients(FIX / f"{slug}.json")


def test_creatine_resolves_exactly_and_finds_its_pathway():
    r = build_mechanism("Creatine", recorded("creatine"))
    assert r.chebi_id == "16919"
    assert "57947" in r.chebi_forms  # the zwitterion Reactome actually uses
    assert ("R-HSA-71288", "Creatine metabolism") in r.pathways
    assert r.ehld == ("R-HSA-71291", "R-HSA-71288")
    assert "SL-0086" in r.sl_ids and len(r.sl_ids) <= MAX_LOCATIONS
    assert r.structure["ligand"] == "CRN"
    assert all(source in {"reactome", "uniprot"} for *_, source, _ref in r.facts)


def test_nmn_is_not_confused_with_nicotinamide():
    r = build_mechanism("Nicotinamide Mononucleotide", recorded("nmn"))
    assert "17154" not in r.chebi_forms  # nicotinamide
    assert ("R-HSA-196807", "Nicotinate metabolism") in r.pathways


def test_magnesium_finds_nothing_rather_than_stearate():
    r = build_mechanism("Magnesium", recorded("magnesium"))
    assert not r.found_anything
    assert "9254" not in r.chebi_forms  # stearate, returned first by fuzzy search


def test_missing_pieces_do_not_fail_the_rest():
    c = recorded("creatine")
    c.rcsb_ligand = lambda _chebi: None
    r = build_mechanism("Creatine", c)
    assert r.structure is None and r.pathways and r.sl_ids


def test_a_failing_source_is_isolated():
    c = recorded("creatine")

    def boom(*_):
        raise RuntimeError("UniProt down")
    c.uniprot_locations = boom
    r = build_mechanism("Creatine", c)
    assert r.sl_ids == [] and r.pathways and r.structure


def test_route_pathways_seed_compounds_without_a_molecule():
    r = build_mechanism("Psyllium Husk", recorded("magnesium"), extra_pathways=[("R-HSA-194068", "Bile acid excretion")])
    assert r.pathways == [("R-HSA-194068", "Bile acid excretion")]


def test_crystallisation_additives_are_not_shown_as_binding():
    c = recorded("creatine")
    c.rcsb_ligand = lambda _chebi: "GOL"
    c.rcsb_best_human_entry = lambda comp: ("9HDW", "Some protein with glycerol")
    r = build_mechanism("Creatine", c)
    assert r.structure is None
