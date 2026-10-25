"""
The four Claude stages of claim-based research. Each returns a validated
structured output, or None when the model declines or the call fails for a
transient reason; configuration errors (bad request, auth) raise.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass
from typing import TypeVar

import anthropic
from pydantic import BaseModel

from app.core.config import settings
from app.services.research.pubmed import Article
from app.services.research.schemas import (
    ClaimDraft,
    ClaimSet,
    ClaimVerdict,
    IngredientSummary,
    StudyAppraisal,
)
from app.services.research.weighting import Weighting

T = TypeVar("T", bound=BaseModel)

# Server-side refusal fallback: a declined request is retried on the model
# Anthropic recommends for that refusal category, inside the same call. Haiku 5.5
# has none (a fallback list 400s), so its declines are just logged and skipped.
_FALLBACK_BETA = "server-side-fallback-2026-07-01"
_SERVER_FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-fable-5"}

CLAIMS_SYSTEM = """\
You are a senior nutrition scientist who also understands how consumers think about \
supplements, foods and skincare ingredients.

Given an ingredient, list the claims people actually believe about it: the reasons they buy it \
or worry about it, not what the literature happens to study. Phrase each claim the way a shopper \
would, as a statement studies can test. Include at least one safety claim that states a risk \
people worry about or should know (interactions, organ effects, pregnancy, high doses). Order \
claims by how common the belief is. For each claim give PubMed outcome terms that would find \
human studies of that outcome, and say honestly where the belief comes from."""

APPRAISAL_SYSTEM = """\
You are a clinical epidemiologist appraising one paper for a consumer evidence service.

Record how the study was done and what it found, using only what the title, abstract and \
metadata report; leave a field null rather than guess. Separate between-group results from \
changes from baseline: an improvement within the ingredient group without a difference from \
the control group is not evidence the ingredient worked. Record the exact form and dose given, \
whether other actives were given in the same arm, and whether the outcome is a symptom, a \
clinical event or only a biomarker. Use the funding and conflict-of-interest metadata when given.

Then say which of the listed claims the study informs and which way it points. Write the three \
reader lines (method_summary, finding, caveat) for an intelligent non-scientist: plain words, \
no abbreviations, no p-values, numbers in everyday units."""

VERDICT_SYSTEM = """\
You are a senior nutrition scientist writing the evidence verdict on one consumer claim, for \
readers who want the truth without hype or alarm.

You get the studies that bear on the claim, strongest first, each with its appraisal, a computed \
quality weight and its caveats. Weigh them as a systematic reviewer would: pooled analyses and \
large, blinded, placebo-controlled trials measuring outcomes people feel count most; small, short, \
unblinded, before-and-after, biomarker-only, combination-product, industry-funded, animal and \
lab studies count little. Judge whether the populations, forms and doses match how people \
actually use the ingredient. Rate certainty GRADE-style. Be honest about gaps, never absolute, \
and never suggest a dose beyond what the studies support.

Base every statement on the studies given: readers can open each one, so do not bring in \
findings from outside the list. If they leave a question open, say it is open. Cite only \
PMIDs you were given."""

SUMMARY_SYSTEM = """\
You are a science communicator for a consumer app that compares what people believe about an \
ingredient with what research shows. Be fair to the belief, honest about the evidence, and \
plain-spoken. Base the reality only on the verdicts given."""


@dataclass(slots=True)
class StudyForVerdict:
    pmid: str
    appraisal: StudyAppraisal
    weighting: Weighting
    stance: str
    relevance: str


class ResearchLLM:
    def __init__(
        self,
        client: anthropic.AsyncAnthropic,
        *,
        model: str | None = None,
        appraisal_model: str | None = None,
        concurrency: int = 5,
    ) -> None:
        self._client = client
        self._model = model or settings.research_model
        self._appraisal_model = appraisal_model or settings.research_appraisal_model
        self._sem = asyncio.Semaphore(concurrency)
        self.usage: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    def model_for(self, stage: str) -> str:
        return self._appraisal_model if stage == "appraisal" else self._model

    async def draft_claims(self, name: str, category: str, synonyms: list[str], mechanism: str | None) -> ClaimSet | None:
        prompt = "\n".join(filter(None, [
            f"Ingredient: {name}",
            f"Category: {category}",
            f"Also known as: {', '.join(synonyms)}" if synonyms else None,
            f"Mechanism notes: {mechanism}" if mechanism else None,
        ]))
        return await self._parse("claims", self._model, "high", CLAIMS_SYSTEM, None, prompt, ClaimSet)

    async def appraise(self, name: str, claims: list[ClaimDraft], article: Article) -> StudyAppraisal | None:
        claims_block = f"Ingredient: {name}\nClaims:\n" + "\n".join(
            f"{i}. [{c.kind}] {c.claim}" for i, c in enumerate(claims, start=1)
        )
        paper = "\n".join(filter(None, [
            f"PMID {article.pmid} ({article.year or 'year unknown'}, {article.journal or 'journal unknown'})",
            f"Publication types: {', '.join(article.publication_types)}" if article.publication_types else None,
            f"MeSH terms: {', '.join(article.mesh_terms)}" if article.mesh_terms else None,
            f"Trial registry: {', '.join(article.registry_ids)}" if article.registry_ids else None,
            f"Funding agencies: {', '.join(article.grant_agencies)}" if article.grant_agencies else None,
            f"Conflict of interest statement: {article.coi_statement}" if article.coi_statement else None,
            f"Title: {article.title}",
            f"Abstract:\n{article.abstract}",
        ]))
        return await self._parse(
            "appraisal", self._appraisal_model, "medium", APPRAISAL_SYSTEM, claims_block, paper, StudyAppraisal
        )

    async def judge_claim(self, name: str, claim: ClaimDraft, studies: list[StudyForVerdict]) -> ClaimVerdict | None:
        lines = [
            f"Ingredient: {name}",
            f"Claim ({claim.kind}): {claim.claim}",
            f"Why people believe it: {claim.why_people_believe}",
            f"\nStudies ({len(studies)}, strongest first):",
        ]
        for study in studies:
            lines.append(_study_block(study))
        return await self._parse("verdict", self._model, "high", VERDICT_SYSTEM, None, "\n".join(lines), ClaimVerdict)

    async def summarize(self, name: str, judged: list[tuple[ClaimDraft, ClaimVerdict]]) -> IngredientSummary | None:
        lines = [f"Ingredient: {name}", "Claims and verdicts:"]
        for claim, verdict in judged:
            lines.append(
                f"- [{claim.kind}] {claim.claim} → {verdict.verdict} (certainty {verdict.certainty}). "
                f"Why believed: {claim.why_people_believe} Reality: {verdict.reality}"
            )
        return await self._parse("summary", self._model, "medium", SUMMARY_SYSTEM, None, "\n".join(lines), IngredientSummary)

    async def _parse(
        self, stage: str, model: str, effort: str, system: str, shared_context: str | None,
        prompt: str, output: type[T],
    ) -> T | None:
        system_blocks = [{"type": "text", "text": system}]
        if shared_context:
            # Per-ingredient context reused across every paper's appraisal: cacheable prefix.
            system_blocks.append({"type": "text", "text": shared_context, "cache_control": {"type": "ephemeral"}})
        fallback = {"betas": [_FALLBACK_BETA], "fallbacks": "default"} if model in _SERVER_FALLBACK_MODELS else {}
        async with self._sem:
            try:
                response = await self._client.beta.messages.parse(
                    model=model,
                    max_tokens=16000,
                    **fallback,
                    output_config={"effort": effort},
                    system=system_blocks,
                    messages=[{"role": "user", "content": prompt}],
                    output_format=output,
                )
            except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.InternalServerError) as exc:
                print(f"    [Claude/{stage}] transient error, skipped: {exc}")
                return None
        usage = self.usage[stage]
        usage["calls"] += 1
        usage["input_tokens"] += response.usage.input_tokens
        usage["output_tokens"] += response.usage.output_tokens
        usage["cache_read_input_tokens"] += response.usage.cache_read_input_tokens or 0
        usage["cache_creation_input_tokens"] += response.usage.cache_creation_input_tokens or 0
        if response.stop_reason == "refusal":
            category = response.stop_details.category if response.stop_details else None
            print(f"    [Claude/{stage}] declined ({category})")
            return None
        if response.stop_reason == "max_tokens":
            print(f"    [Claude/{stage}] ran out of tokens")
            return None
        return response.parsed_output


def _study_block(study: StudyForVerdict) -> str:
    a, w = study.appraisal, study.weighting
    dose = " ".join(str(x) for x in (a.dose_amount, a.dose_unit, a.dose_frequency) if x not in (None, ""))
    parts = [
        f"[PMID {study.pmid} | weight {w.score:.2f} ({w.tier}) | {study.stance}, {study.relevance}]",
        f"  Design: {a.design}; blinding {a.blinding}; control {a.control}"
        + (f" ({a.comparator})" if a.comparator else ""),
        f"  People: {a.population or 'not reported'} ({a.health_status}); n={a.n_analyzed or a.n_enrolled or '?'}"
        + (f"; {a.studies_included} studies pooled, I²={a.heterogeneity_i2}" if a.studies_included else ""),
        f"  Form/dose: {a.intervention_form or '?'}; {dose or 'dose not reported'}"
        + (f"; {a.duration_weeks} weeks" if a.duration_weeks else "")
        + (f"; with {', '.join(a.co_actives)}" if a.is_combination else ""),
        f"  Outcome: {a.primary_outcome or '?'} ({a.outcome_type}); {a.comparison_basis}; result {a.result}"
        + (f"; {a.effect_summary}" if a.effect_summary else "")
        + f"; clinically meaningful: {a.clinically_meaningful}",
        f"  Funding: {a.funding}" + (f"; caveats: {', '.join(f.label for f in w.flags)}" if w.flags else ""),
        f"  Finding: {a.finding}",
    ]
    return "\n".join(parts)
