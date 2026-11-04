"""Ranking merged product + catalog search results."""
from app.services.catalog.ranking import Candidate, rank


def c(key, name, *, brand=None, popularity=0, countries=(), hydrated=False):
    return Candidate(key=key, name=name, brand=brand, popularity=popularity, countries=tuple(countries),
                     hydrated=hydrated, payload=None)


def keys(candidates):
    return [x.key for x in candidates]


def test_a_name_prefix_beats_a_more_popular_substring_match():
    ranked = rank("nutella", [c("b", "Biscuits with Nutella", popularity=100_000), c("a", "Nutella", popularity=10)], country=None)
    assert keys(ranked) == ["a", "b"]


def test_a_brand_prefix_beats_a_plain_substring_match():
    ranked = rank("ferrero", [c("b", "Gift box with ferrero"), c("a", "Rocher", brand="Ferrero")], country=None)
    assert keys(ranked) == ["a", "b"]


def test_products_sold_in_the_users_country_rise():
    ranked = rank(
        "cola",
        [c("fr", "Classic cola", popularity=1_000, countries=["FR"]), c("us", "Diet cola", popularity=100, countries=["US"])],
        country="US",
    )
    assert keys(ranked) == ["us", "fr"]


def test_popularity_breaks_ties():
    ranked = rank("oat milk", [c("a", "Oat milk", popularity=5), c("b", "Oat milk", popularity=50)], country=None)
    assert keys(ranked) == ["b", "a"]


def test_hydrated_products_win_exact_ties():
    ranked = rank("oat milk", [c("a", "Oat milk"), c("b", "Oat milk", hydrated=True)], country=None)
    assert keys(ranked) == ["b", "a"]


def test_duplicate_keys_collapse_to_the_first_occurrence():
    first = c("p:1", "Nutella", hydrated=True)
    ranked = rank("nutella", [first, c("p:1", "Nutella")], country=None)
    assert len(ranked) == 1 and ranked[0] is first


def test_queries_are_normalised_like_search_text():
    ranked = rank("CAFÉ", [c("b", "Noir cafe"), c("a", "Café noir")], country=None)
    assert keys(ranked) == ["a", "b"]


def test_a_whole_word_name_prefix_beats_a_longer_word_that_starts_with_the_query():
    """"shampoo" should put Shampoo before the French Shampooing, however often that's scanned."""
    ranked = rank("shampoo", [c("fr", "Shampooing karité", popularity=114), c("es", "Shampoo", popularity=53)], country=None)
    assert keys(ranked) == ["es", "fr"]


def test_while_a_word_is_being_typed_name_prefixes_still_lead():
    ranked = rank(
        "shamp", [c("a", "Anti dandruff shampoo", popularity=46), c("b", "Shampooing karité", popularity=114)], country=None
    )
    assert keys(ranked) == ["b", "a"]


def test_sold_in_the_users_country_beats_a_foreign_name_prefix():
    """Production, "shampoo" on a US device: Moroccan and French matches outranked every US
    shampoo, which mostly have one or two scans."""
    ranked = rank(
        "shampoo",
        [
            c("ma", "SHAMPOO", popularity=132, countries=["MA"]),
            c("fr", "Shampooing karité", brand="Le Petit Olivier", popularity=114, countries=["FR", "MA"]),
            c("us-hs", "Anti Dandruff Shampoo Deep Clean", brand="Head&shoulders", popularity=46, countries=["MA", "US"]),
            c("us-dove", "Dove daily moisture shampoo", brand="Unilever", popularity=1, countries=["US"]),
        ],
        country="US",
    )
    assert keys(ranked) == ["us-hs", "us-dove", "ma", "fr"]


def test_a_far_more_popular_foreign_product_named_exactly_like_the_query_still_leads():
    ranked = rank(
        "shampoo",
        [c("us", "Anti dandruff shampoo", popularity=1, countries=["US"]), c("es", "Shampoo", popularity=10_000, countries=["ES"])],
        country="US",
    )
    assert keys(ranked) == ["es", "us"]
