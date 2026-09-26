from app.services.identity.taxonomies import build_catalog

OFF = {
    "en:sugar": {"name": {"en": "sugar", "fr": "sucre", "bg": "захар"}, "wikidata": {"en": "Q11002"}},
    "en:emulsifier": {"name": {"en": "Emulsifier", "fr": "émulsifiant"}},
    "en:e330": {"name": {"en": "E330"}, "e_number": {"en": "330"}, "wikidata": {"en": "Q159683"}},
}
ADD = {"en:e330": {"name": {"en": "E330 - Citric acid", "fr": "E330 - Acide citrique"}, "e_number": {"en": "330"}}}
CLASSES = {"en:emulsifier": {}}
COSING = [["89078", " GLYCERIN ", "", "", "56-81-5 ", "200-289-5", "", "", "HUMECTANT", "01/01/2010"],
          ["1", "CITRIC ACID", "", "", "77-92-9", "", "", "", "BUFFERING", ""]]
LIB = [{"id": "lib-glycerin", "canonical_name": "Glycerin", "synonyms": ["Glycerol"]},
       {"id": "lib-nmn", "canonical_name": "Nicotinamide Mononucleotide", "synonyms": ["NMN"]}]


def build():
    specs, index = build_catalog(OFF, ADD, CLASSES, COSING, LIB)
    return {s.key: s for s in specs}, index


def test_multilingual_names_resolve_to_one_substance():
    specs, index = build()
    assert index["sucre"] == index["захар"] == index["sugar"] == "off:en:sugar"
    assert specs["off:en:sugar"].wikidata == "Q11002"


def test_additive_names_lose_their_e_prefix():
    _, index = build()
    assert index["acide citrique"] in {"off:en:e330", "offadd:en:e330"}


def test_off_beats_cosing_for_the_same_spelling():
    _, index = build()
    assert index["citric acid"].startswith("off")


def test_class_words_are_typed_as_classes():
    specs, index = build()
    assert specs[index["émulsifiant"]].type == "class"
    assert specs["off:en:sugar"].type == "substance"


def test_library_links_to_the_taxonomy_substance():
    specs, index = build()
    glycerin = specs[index["glycerin"]]
    assert glycerin.key == "cosing:89078" and glycerin.ingredient_id == "lib-glycerin"
    assert index["glycerol"] == "cosing:89078"


def test_unmatched_library_ingredient_becomes_its_own_substance():
    specs, index = build()
    assert index["nmn"] == "lib:lib-nmn" and specs["lib:lib-nmn"].ingredient_id == "lib-nmn"


def test_cosing_keeps_inci_and_cas():
    specs, _ = build()
    assert specs["cosing:89078"].inci_name == "GLYCERIN" and specs["cosing:89078"].cas == "56-81-5"
