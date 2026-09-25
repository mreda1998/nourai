from pathlib import Path

from app.services.routes.schema import load_route, validate_route

F = Path(__file__).parent / "fixtures" / "routes"


def test_good_route_is_valid():
    assert validate_route(load_route(F / "good.yaml")) == []


def test_stop_without_reason_is_rejected():
    errors = validate_route(load_route(F / "missing_stop_reason.yaml"))
    assert any("stop_reason" in e for e in errors)


def test_mechanism_link_cannot_claim_strong_outcome():
    errors = validate_route(load_route(F / "mechanism_overclaim.yaml"))
    assert any("outcome" in e and "limited" in e for e in errors)


def test_outcome_link_needs_a_claim_with_citation():
    r = load_route(F / "good.yaml")
    r.links[2].claims = []
    assert any("claim" in e for e in validate_route(r))


def test_claim_needs_a_citation():
    r = load_route(F / "good.yaml")
    r.links[2].claims[0].citations = []
    assert any("citation" in e for e in validate_route(r))


def test_unknown_node_reference_is_rejected():
    r = load_route(F / "good.yaml")
    r.links[0].to = "nowhere"
    assert any("nowhere" in e for e in validate_route(r))


def test_confidence_interval_must_be_ordered():
    r = load_route(F / "good.yaml")
    r.links[2].claims[0].effect.ci = [1.76, 0.97]
    assert any("ci" in e for e in validate_route(r))


def test_certainty_uses_grade_scale():
    r = load_route(F / "good.yaml")
    r.links[2].claims[0].certainty = "pretty sure"
    assert any("certainty" in e for e in validate_route(r))


def test_mechanism_link_into_outcome_still_needs_a_cited_claim():
    r = load_route(F / "good.yaml")
    link = r.links[2]
    link.evidence_type, link.strength, link.claims = "proposed", "limited", []
    assert any("claim" in e for e in validate_route(r))
