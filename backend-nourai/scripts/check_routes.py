"""Validate route files and check their sources. Exits 1 on any error.

Usage: python scripts/check_routes.py [content/routes/*.yaml ...]
Prints a Markdown report (used as the PR comment in CI).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pydantic import ValidationError  # noqa: E402

from app.services.routes.checks import HttpFetchers, check_route  # noqa: E402
from app.services.routes.schema import load_route, validate_route  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="*", type=Path)
    args = parser.parse_args()
    paths = args.paths or sorted((REPO_ROOT / "content" / "routes").glob("*.yaml"))

    fetchers = HttpFetchers()
    failed = False
    print("## Route checks\n")
    for path in paths:
        try:
            route = load_route(path)
        except (ValidationError, ValueError) as exc:
            failed = True
            print(f"### ❌ `{path.name}` — invalid file\n\n```\n{exc}\n```\n")
            continue

        errors = validate_route(route)
        report = check_route(route, fetchers) if not errors else None
        if report:
            errors += report.errors
        failed |= bool(errors)

        print(f"### {'❌' if errors else '✅'} `{route.slug}`\n")
        for e in errors:
            print(f"- **Error:** {e}")
        for n in report.needs_full_text if report else []:
            print(f"- **Reviewer, confirm from the full text:** {n}")
        if not errors and not (report and report.needs_full_text):
            print("- All citations resolve, every number appears in its abstract, all identifiers resolve.")
        print()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
