"""Import merged route files as published, versioned routes.

Usage:
  python scripts/import_routes.py [content/routes/*.yaml ...] [--dry-run]
      [--reviewer NAME] [--commit SHA]

Reviewer and commit default to the last git commit that touched each file —
merging the PR is the approval, so its author is the reviewer.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import async_session_factory  # noqa: E402
from app.services.routes.importer import RouteImportError, apply_route  # noqa: E402
from app.services.routes.schema import load_route, validate_route  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]


def _git(path: Path, fmt: str) -> str | None:
    try:
        out = subprocess.run(
            ["git", "log", "-1", f"--format={fmt}", "--", str(path)],
            cwd=REPO_ROOT, capture_output=True, text=True, check=True,
        ).stdout.strip()
        return out or None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


async def run(paths: list[Path], reviewer: str | None, commit: str | None, dry_run: bool) -> int:
    failed = 0
    async with async_session_factory() as session:
        for path in paths:
            route = load_route(path)
            errors = validate_route(route)
            if errors:
                print(f"✗ {route.slug}: invalid — {errors}")
                failed += 1
                continue
            who = reviewer or _git(path, "%an")
            if not who:
                print(f"✗ {route.slug}: no reviewer (commit the file or pass --reviewer)")
                failed += 1
                continue
            try:
                action = await apply_route(
                    session, route, reviewer=who, commit=commit or _git(path, "%H"),
                    source_path=str(path.resolve().relative_to(REPO_ROOT)), dry_run=dry_run,
                )
            except RouteImportError as exc:
                print(f"✗ {exc}")
                failed += 1
                continue
            print(f"{'·' if dry_run else '✓'} {route.slug}: {action.kind} (v{action.version}, reviewer {who})")
        if dry_run:
            await session.rollback()
            print("\n[DRY RUN — nothing written]")
        else:
            await session.commit()
    return 1 if failed else 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="*", type=Path)
    parser.add_argument("--reviewer")
    parser.add_argument("--commit")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    paths = args.paths or sorted((REPO_ROOT / "content" / "routes").glob("*.yaml"))
    sys.exit(asyncio.run(run(paths, args.reviewer, args.commit, args.dry_run)))


if __name__ == "__main__":
    main()
