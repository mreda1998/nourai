"""Draft a reviewed-route file with Claude, then check it like CI would.

Usage:
  python scripts/draft_route.py --ingredient "Psyllium Husk" --pmid 30239559 [--pmid ...]
      [--note "focus on LDL"] [--out content/routes]

Claude only sees the abstracts you pass and must use only numbers found in
them. The draft is marked `drafted_by: ai`, validated and checked, and saved
for a human to review in a pull request — this script never publishes.

Requires Anthropic credentials (ANTHROPIC_API_KEY or `ant auth login`).
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import anthropic  # noqa: E402
import yaml  # noqa: E402
from pydantic import ValidationError  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services.routes.checks import HttpFetchers, check_route  # noqa: E402
from app.services.routes.schema import RouteFile, validate_route  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = REPO_ROOT / "content" / "routes" / "creatine-strength-training.yaml"
MODEL = "claude-opus-5"

SYSTEM = """You draft evidence routes for Elory, an app that explains how an ingredient acts in the \
body and how far human evidence actually goes. Readers trust it because it never overstates.

A route is ingredient → mechanism → measured human outcome → a boundary where evidence stops.

Rules:
- Use only the abstracts provided. Every number in a claim (effect estimate, CI bounds, dose bounds, \
sample sizes) must appear in an abstract. If an abstract gives no number, leave the field out.
- Mechanism links (evidence_type established_biochemistry or proposed) carry no outcome claims; a link \
into an outcome node needs at least one claim with a citation.
- End with at least one boundary node reached by a link with evidence_stops_here: true and a plain \
stop_reason saying what was not shown or not studied.
- Only add chebi / reactome / uniprot identifiers you are certain of; they are verified automatically \
and a reviewer checks them. Leave them out when unsure.
- Write plain language for a general reader. No hype, no advice, no "may help" without evidence.
- Set drafted_by: ai on every claim. domain must be one of: inflammation_immune, skin_appearance, \
energy_metabolism, gut_digestive, cognitive_mental, cardiovascular, bone_joint, hormonal_endocrine, \
body_composition, sleep_recovery. direction is supports, mixed or risk.

Reply with the YAML file only, in one ```yaml fenced block, following the example's format exactly."""


def _abstracts(fetchers: HttpFetchers, pmids: list[str]) -> str:
    parts = []
    for pmid in pmids:
        text = fetchers.abstract(pmid)
        if text is None:
            sys.exit(f"PMID {pmid} could not be retrieved")
        parts.append(f"<abstract pmid=\"{pmid}\">\n{text}\n</abstract>")
    return "\n\n".join(parts)


def _ask(client: anthropic.Anthropic, messages: list[dict]) -> str:
    with client.messages.stream(
        model=MODEL,
        max_tokens=16000,
        system=SYSTEM,
        messages=messages,
        # The installed SDK (0.40) predates these request fields; pass them through.
        extra_body={"thinking": {"type": "adaptive"}, "output_config": {"effort": "high"}, "fallbacks": "default"},
        extra_headers={"anthropic-beta": "server-side-fallback-2026-07-01"},
    ) as stream:
        message = stream.get_final_message()
    if message.stop_reason == "refusal":
        sys.exit("Claude declined to draft this route.")
    if message.stop_reason == "max_tokens":
        sys.exit("The draft was cut off (max_tokens); try fewer abstracts.")
    return "".join(getattr(block, "text", "") for block in message.content if getattr(block, "type", "") == "text")


def _parse(reply: str) -> tuple[RouteFile | None, str]:
    match = re.search(r"```(?:yaml)?\n(.*?)```", reply, re.DOTALL)
    text = match.group(1) if match else reply
    try:
        route = RouteFile.model_validate(yaml.safe_load(text))
    except (ValidationError, yaml.YAMLError, TypeError) as exc:
        return None, f"The file did not parse against the route schema:\n{exc}"
    errors = validate_route(route)
    return (route, "") if not errors else (None, "The route has structural errors:\n- " + "\n- ".join(errors))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ingredient", required=True)
    parser.add_argument("--pmid", action="append", required=True)
    parser.add_argument("--note", default="")
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "content" / "routes")
    args = parser.parse_args()

    fetchers = HttpFetchers()
    user = (
        f"Draft a route for the ingredient \"{args.ingredient}\" (use exactly this name).\n"
        f"{('Reviewer note: ' + args.note) if args.note else ''}\n\n"
        f"Format example (a published route):\n```yaml\n{EXAMPLE.read_text()}```\n\n"
        f"Abstracts:\n{_abstracts(fetchers, args.pmid)}"
    )
    # The SDK reads ANTHROPIC_API_KEY from the environment; fall back to the app's .env setting.
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY") or settings.anthropic_api_key or None)
    messages = [{"role": "user", "content": user}]

    route, problem = None, ""
    for _attempt in range(2):
        reply = _ask(client, messages)
        route, problem = _parse(reply)
        if route:
            break
        messages += [{"role": "assistant", "content": reply},
                     {"role": "user", "content": f"{problem}\n\nReturn the corrected YAML file only."}]
    if route is None:
        sys.exit(problem)

    for link in route.links:
        for claim in link.claims:
            claim.drafted_by = "ai"
    report = check_route(route, fetchers)

    args.out.mkdir(parents=True, exist_ok=True)
    path = args.out / f"{route.slug}.yaml"
    data = route.model_dump(mode="json", by_alias=True, exclude_none=True, exclude_defaults=False)
    path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=100))

    print(f"Draft written to {path}\n")
    for e in report.errors:
        print(f"✗ {e}")
    for n in report.needs_full_text:
        print(f"? confirm from full text: {n}")
    if report.ok and not report.needs_full_text:
        print("✓ citations resolve, numbers appear in abstracts, identifiers resolve")
    print("\nNext: review the file, fix anything wrong, and open a pull request. Merging publishes it.")


if __name__ == "__main__":
    main()
