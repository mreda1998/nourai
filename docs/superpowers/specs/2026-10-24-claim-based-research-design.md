# Claim-based ingredient research — design

Date: 2026-10-24. Replaces the per-abstract pipeline in `backend-nourai/scripts/research_agent.py`
(steps 1–5; the mechanism image and Atelier passes are unchanged).

## Why

A reader judging "does turmeric help my joints?" needs to know *how* each study was done: a
one-week trial in 34 people and a 12-week trial in 400 do not deserve the same weight. The old
pipeline lost that:

- confidence came from study type alone (every RCT was "high"), so GHRP-6 rated "strong" on two trials;
- no duration, comparator, outcome type or between-group vs before/after result was captured
  (one curcumin trial was stored as "reduced liver fibrosis" though it did no better than lifestyle advice);
- different exposures were pooled (nano-capsules, a herbal combination, curry, a food colourant);
- dose was extracted and discarded;
- the belief/reality summary saw one-line findings with no study size or quality;
- PubMed search was a relevance-ranked grab-bag, not aimed at what people actually believe.

Both audiences matter equally (user decision): readers see each study's method, and the
pipeline uses the same structure to weigh studies before concluding.

## Shape

Research is organised around **claims** — what consumers believe an ingredient does, plus
safety questions — and each claim gets its own verdict from the studies that test it.

1. **Claims** (Claude): 3–8 claims per ingredient in consumer words, at least one safety claim,
   why people believe each (traditional use, marketing, lab/animal work, a famous study…),
   PubMed search terms per claim, and the names/synonyms to search.
2. **Search** (PubMed, per claim): synonyms × outcome terms; systematic reviews/meta-analyses,
   then RCTs, then observational; human-only for benefit claims; retracted papers excluded.
   PubMed's own metadata is kept: publication types, MeSH terms, trial registry numbers,
   grant agencies, conflict-of-interest statement.
3. **Appraisal** (Claude, once per paper): design, randomisation, blinding, comparator,
   population and health status, n, form/formulation and co-actives, route, dose and duration,
   primary outcome and its type (clinical / patient-reported / biomarker / mechanistic),
   whether the result is versus control or only before/after, effect in numbers, registration,
   funding, limitations — plus which claims it informs and in which direction, and three plain
   lines for readers: what they did, what they found, the main caveat.
4. **Weight** (code, deterministic): a 0–1 score and tier from design × size × duration ×
   blinding × control × comparison basis × outcome type × combination product × funding, with
   human-readable flags ("Small study (34 people)", "Only before/after", "Measured blood markers,
   not symptoms"). The flags are the caveat tags shown in the app. A scientist must be able to
   explain any weight, so this is not left to the model.
5. **Verdict** (Claude, per claim): verdict, certainty (GRADE-style) and the reasons it was
   lowered, plain reality, effect size in plain terms, who it applies to, dose note, key PMIDs.
   Code caps certainty at what the best supporting study's tier allows.
6. **Ingredient summary**: belief vs reality and `evidence_level` derived from the claim
   verdicts; biodomain scoring fed from the appraised studies.

A re-run replaces an ingredient's claims and evidence (clean, idempotent).

## Storage

- `ingredient_claims` — one row per claim with verdict, certainty, texts, key PMIDs.
- `claim_evidence` — claim ↔ study link with stance (supports / refutes / inconclusive).
- `ingredient_evidence` gains `appraisal` (full JSON), `method_summary`, `caveat`,
  `quality_score`, `quality_tier`, `quality_flags`, `duration_weeks`, dose fields,
  `intervention_form`, `outcome_type`; legacy columns stay populated for older app builds.
- RLS enabled on the new tables (production policy: the backend reads as owner).

## Models (builder's call, configurable)

Claude Opus 5.5 for every stage by default, via structured outputs. Per-stage model settings
let appraisal move to a cheaper model later if cost matters at scale — a user decision.

## App

Evidence tab leads with claim cards (claim, verdict, certainty, one-line reality, study
count). A claim opens its studies; every study card shows the method line, finding and caveat
tags. Older builds keep working from the legacy fields.

## Out of scope here

Growing the ingredient list (a separate project, after this pipeline is trusted); full-text
(PMC) reading; Batch API for large runs.
