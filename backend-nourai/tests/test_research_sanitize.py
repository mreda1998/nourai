from scripts.research_agent import _as_int, _as_text


def test_placeholders_become_none():
    assert _as_int("<UNKNOWN>") is None and _as_text("<UNKNOWN>") is None
    assert _as_text("unknown") is None and _as_text("N/A") is None


def test_real_values_survive():
    assert _as_int(38) == 38 and _as_int("1,924") == 1924 and _as_int("721 participants") == 721
    assert _as_text("healthy adults") == "healthy adults"


def test_non_numbers_are_not_guessed():
    assert _as_int("several hundred") is None and _as_int(None) is None and _as_int(True) is None


def test_long_text_is_clipped_to_the_column():
    from scripts.research_agent import _fit
    assert len(_fit("population", "x" * 400)) == 150
    assert _fit("population", "<UNKNOWN>") is None
    assert _fit("title", "y" * 5000) == "y" * 5000  # Text columns are unbounded
