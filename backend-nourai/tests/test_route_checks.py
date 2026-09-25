from pathlib import Path

from app.services.routes.checks import check_route, numbers_in
from app.services.routes.schema import load_route

F = Path(__file__).parent / "fixtures" / "routes"
ABSTRACT = (
    "Creatine supplementation resulted in greater increases in lean tissue mass "
    "(mean difference =1.37 kg [95% CI =0.97-1.76]) with 3 to 5 g daily."
)


class Fake:
    def __init__(self, abstract=ABSTRACT, ok=True, bad_ids=()):
        self.a, self.ok, self.bad = abstract, ok, set(bad_ids)
        self.pmids = []

    def abstract(self, pmid):
        self.pmids.append(pmid)
        return self.a if self.ok else None

    def doi_exists(self, doi):
        return self.ok

    def chebi_exists(self, i):
        return self.ok and i not in self.bad

    def reactome_exists(self, i):
        return self.ok and i not in self.bad

    def uniprot_exists(self, i):
        return self.ok and i not in self.bad


def test_good_route_passes():
    rep = check_route(load_route(F / "good.yaml"), Fake())
    assert rep.ok, rep.errors
    assert rep.needs_full_text == []


def test_unresolvable_citation_fails():
    rep = check_route(load_route(F / "good.yaml"), Fake(ok=False))
    assert not rep.ok
    assert any("29138605" in e for e in rep.errors)


def test_unknown_identifier_fails():
    rep = check_route(load_route(F / "good.yaml"), Fake(bad_ids={"R-HSA-71288"}))
    assert not rep.ok and any("R-HSA-71288" in e for e in rep.errors)


def test_number_missing_from_abstract_needs_full_text():
    rep = check_route(load_route(F / "good.yaml"), Fake(abstract="no numbers here"))
    assert rep.ok
    assert rep.needs_full_text and "1.37" in rep.needs_full_text[0]


def test_numbers_are_formatted_like_papers():
    claim = load_route(F / "good.yaml").links[2].claims[0]
    assert {"1.37", "0.97", "1.76", "3", "5"} <= set(numbers_in(claim))


def test_negative_estimates_match_unsigned_or_unicode_minus():
    claim = load_route(F / "good.yaml").links[2].claims[0]
    claim.effect.estimate, claim.effect.ci = -0.33, [-0.38, -0.27]
    claim.dose = None
    from app.services.routes.checks import missing_numbers
    assert missing_numbers(claim, "MD = −0.33 mmol/L; 95% CI: −0.38, −0.27") == []


def test_a_number_inside_a_longer_number_does_not_count():
    claim = load_route(F / "good.yaml").links[2].claims[0]
    claim.dose = None
    from app.services.routes.checks import missing_numbers
    assert "1.37" in missing_numbers(claim, "values 11.375 and 0.97-1.76")


def test_each_pmid_is_fetched_once():
    fake = Fake()
    r = load_route(F / "good.yaml")
    r.links[2].claims.append(r.links[2].claims[0].model_copy(deep=True))
    check_route(r, fake)
    assert fake.pmids == ["29138605"]


def test_dose_numbers_must_come_with_their_unit():
    from app.services.routes.checks import missing_numbers
    claim = load_route(F / "good.yaml").links[2].claims[0]
    claim.effect = None
    assert set(missing_numbers(claim, "training 2-3 days/week for 5 weeks")) == {"3", "5"}
    assert missing_numbers(claim, "doses of 3-5 g/day") == []
    assert missing_numbers(claim, "3 to 5 g per day") == []
    assert missing_numbers(claim, "3 g loading, then 5 g") == []


def test_trailing_zeros_in_the_abstract_still_match():
    from app.services.routes.checks import missing_numbers
    claim = load_route(F / "good.yaml").links[2].claims[0]
    claim.dose = None
    claim.effect.estimate, claim.effect.ci = -0.39, [-0.5, -0.27]
    assert missing_numbers(claim, "MD = -0.39 mmol/L; 95% CI: -0.50, -0.27 mmol/L") == []
    claim.effect.estimate, claim.effect.ci = 2, None
    assert missing_numbers(claim, "a difference of 2.0 points") == []
