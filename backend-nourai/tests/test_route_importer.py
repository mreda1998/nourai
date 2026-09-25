from pathlib import Path

import yaml

from app.services.routes.importer import content_hash, plan_import
from app.services.routes.schema import RouteFile, load_route

GOOD = Path(__file__).parent / "fixtures" / "routes" / "good.yaml"
R = load_route(GOOD)


def test_first_import_creates_version_1():
    a = plan_import(R, None)
    assert (a.kind, a.version) == ("create", 1)


def test_same_content_is_unchanged():
    a = plan_import(R, (1, content_hash(R)))
    assert (a.kind, a.version) == ("unchanged", 1)


def test_changed_content_creates_next_version():
    a = plan_import(R, (3, "different"))
    assert (a.kind, a.version) == ("new_version", 4)


def test_hash_ignores_yaml_key_order():
    raw = yaml.safe_load(GOOD.read_text())
    reordered = RouteFile.model_validate(dict(reversed(list(raw.items()))))
    assert content_hash(reordered) == content_hash(R)


def test_hash_changes_with_a_claim_number():
    changed = R.model_copy(deep=True)
    changed.links[2].claims[0].effect.estimate = 1.4
    assert content_hash(changed) != content_hash(R)
