# Ingredient rules by country — design

Date: 2026-11-04. Status: reviewed by a fresh builder read; awaiting owner approval.

## Why

People are spending on "non-toxic" and "clean" faster than the evidence supports (a16z, *The State of
Longevity*, 3 Nov 2026). A large part of that conversation is "banned in Europe, still sold in America",
and much of what circulates is wrong. Tartrazine (Yellow 5), for example, is not banned in the EU; it must
carry a warning that it may affect children's activity and attention. Checking what the law actually
says, where, for what kind of product and since when, is Elory's belief-vs-reality idea applied to
regulation.

It also separates Elory from Oasis. Oasis measures contaminants in products it buys and scores them 1–100,
using legal limits as benchmarks. From its public pages (read 2026-11-04) it does not show an ingredient's
legal status country by country. Elory does not hold lab data (production has zero lab rows) and will not
compete on testing.

Rules are also much cheaper per ingredient than the claim research, so they can cover ingredients we have
not researched. Production has 100 researched ingredients; a product page shows many more.

Later, the same data feeds a label-claims check. The EU's register of authorised and rejected health
claims, and Canada's authorised supplement claims, are regulatory facts about claims.

## What exists today

- The ingredient page already has a "Regulatory status" section (`nourai/app/ingredient/[id].tsx:248`).
  It shows `us_regulatory_status`, `wada_status` and administration routes. These are peptide-only
  columns on `ingredients`, and production has no values in them (no peptides are seeded there).
- `backend-nourai/scripts/fetch_cosing_data.py` imports the EU cosmetics ingredient list (CosIng) into
  `ingredients.extra_data.cosing`. That column does not exist on `ingredients`, so the script cannot run.
  This design supersedes it.
- Provenance tables already exist for external data: `data_sources` and `source_records`
  (`backend-nourai/app/models/ingestion.py`). Lab results use the same pattern.
- Ingredient matching is conservative: exact normalized aliases only, and an ambiguous alias stays
  unmatched (`app/services/ingestion/resolver.py`, `ingredient_aliases`).
- Open Food Facts `additives_tags` (E-numbers) are parsed during catalog import but are not stored on
  `catalog_entries` or `products`.
- Users have no country field, and `expo-localization` is not installed in the app.
- Where catalog products are sold (1% sample of `catalog_entries.countries`, 2026-11-04): France 25%,
  US 21%, Germany 10%, Spain 8%, Italy 6%, UK 5%, Canada 3%, Australia 2%, Japan 1%. This reflects Open
  Food Facts contributors, not Elory users. It does mean EU and French rules apply to the most products we
  show, even though Canada is the launch hypothesis.

## Goals

1. For any ingredient we can identify, show the rules in each covered place: what they say, what kind of
   product they cover, the condition or limit, when they took effect, and the official source.
2. Keep binding law and expert opinion visibly separate.
3. On the product page, flag only noteworthy rules, read in the product's category.
4. Show the person's own country first.
5. Make every rule traceable to an official source and a check date, and re-checkable.

## Non-goals

- Legal or compliance advice; a compliance tool for brands.
- Any score or grade derived from rules.
- Alerts when a rule changes (later phase).
- Flagging products sold somewhere their ingredient is banned. At first this is more likely to be a data
  error than a real finding.
- Asia, Latin America and the Gulf in this release (Japan and South Korea come later).
- Lab testing or contaminant measurement.

## Anti-goals: failures even if it works

- A rule the source does not say. A wrong "banned in France" is worse than showing nothing.
- A missing rule that reads as "allowed".
- "Banned" without its scope: only as a food additive, only in children's products, only above a level.
- An expert hazard classification shown as a ban, or as risk at normal intake.
- Fear framing, or rules used to sell membership. Rules are free. This matches the beta plan: applicable
  safety information stays accessible.
- Rules written from an AI model's memory.

## Coverage

**Places**

- Core: European Union, France, Canada, United States (federal), California.
- Also in scope: United Kingdom; Australia and New Zealand (shared food code; Australia's TGA for
  supplements); Germany and Italy for supplements and botanicals only. The EU does not set common rules
  for plants or maximum vitamin doses in supplements, so member states set their own.
- Sport: the WADA prohibited list, as its own place.

**Expert bodies.** IARC, JECFA (with Codex), EFSA. A rule's kind is set by whether the instrument binds
anyone, not by who published it. ECHA's microplastics restriction became Commission Regulation (EU)
2023/2055, so it is EU law. An ECHA committee opinion is an expert view.

**Product scope a rule can cover:** food, food additive, supplement, cosmetic, medicine
(prescription-only status), sport.

### Phases (my call)

**Phase 1, this release**

- The data model, matching, API, ingredient-page and product-page UI.
- Bulk official sources:
  - EU CosIng annexes II–VI (cosmetics)
  - EU food additives union list (Regulation (EC) 1333/2008, including the Annex V warning-label colours)
  - US FDA: colour additive status list; prohibited and restricted cosmetic ingredients (21 CFR 700);
    food additive status / Substances Added to Food inventory
  - Canada: Cosmetic Ingredient Hotlist; Lists of Permitted Food Additives
  - IARC list of classifications
- Curated rules:
  - California AB 418 (four substances, effective 1 Jan 2027)
  - French national rules
  - The 100 researched ingredients across the core places, plus UK, Australia, Germany and Italy where a
    specific rule exists
  - Peptide US and WADA statuses, re-sourced through the curated path. The values in
    `backend-nourai/scripts/seed_peptides.py` have no source and must not be migrated as-is. For example,
    it marks BPC-157 "not prohibited" by WADA, but WADA's list names BPC-157 under S0 (non-approved
    substances).

**Phase 2**

- Reference values from EFSA OpenFoodTox; JECFA acceptable daily intakes.
- ECHA microplastics restriction and the list of substances of very high concern; California Prop 65.
- Canada natural health product monographs; UK and FSANZ bulk lists; the TGA permitted indications.
- The EU health claims register.
- A re-check job for curated sources.

**Phase 3**

- Japan, South Korea.
- Alerts when a rule changes.

**Source checks.** Before writing an importer, the builder verifies each source's current URL, format and
reuse terms, and records the licence in `data_sources`. A source without a usable bulk format moves to the
curated path.

## Data model

The shape is decided; table and column names are left to the builder.

### 1. Substance

The thing a rule is about. It is separate from the research library.

- Holds identifiers where known: E-number / INS, CAS, EC, INCI name, UNII, plus a display name.
- Links to canonical `ingredients` **many-to-many**, through a join table.
- Why many-to-many: canonical ingredients deliberately merge things that are separate substances in law.
  - Titanium dioxide covers E171 and CI 77891.
  - Retinol covers vitamin A and retinyl esters.
  - Caramel colour covers E150a–d.
  - Curcumin covers turmeric and E100.
  - Zinc covers zinc oxide, a UV filter in cosmetics.
  - Parabens is a group whose esters have different rules.
- Why separate from the research library: rules exist for thousands of substances we will never research.
  The canonical ingredient list stays curated, with no auto-created stubs.

### 2. Substance alias

- Normalized names in English, French, German and Italian at least, because French, German and Italian
  products dominate the catalog.
- Also E-numbers and INCI names.
- Matching is exact on the normalized alias. Ambiguous aliases stay unmatched, the same rule as
  `resolve_ingredients`.

### 3. Rule

One row per substance × place × product scope × legal instrument.

- **place**: EU, FR, DE, IT, GB, CA, US, US-CA, AU, NZ, WADA, or an expert body (IARC, JECFA, EFSA).
- **authority**: for example European Commission, FDA, Health Canada, ANSES, IARC.
- **kind**: `law` or `expert_view`.
- **status**, for law, one of:
  - **banned**: explicitly prohibited, as in CosIng Annex II or an FDA revocation
  - **not authorised**: absent from a positive list (see "Positive-list absence" below)
  - **prescription only**
  - **approval required**
  - **warning label**: a consumer-facing health warning the law requires, such as the EU Annex V colours.
    Allergen-labelling duties are not this; they are conditions on "allowed with limits".
  - **allowed with limits**: permitted with conditions, such as a maximum level, permitted food
    categories, or a labelling duty
  - **allowed**
  - **listed**: for listings that carry duties, such as substances of very high concern or Prop 65
- **status**, for expert views: the body's own classification, such as IARC Group 1 / 2A / 2B / 3, an
  acceptable daily intake value, or an EFSA conclusion. Expert views never use the law vocabulary.
- **applies_to**: one of the product scopes, plus optional sub-scope text ("leave-on products",
  "children under 3", "inhalable forms").
- **condition text**, and a structured limit (value, unit, basis) when one exists.
- **effective_from** and **effective_until**, so future-dated rules display correctly
  ("Banned from 1 Jan 2027").
- **legal_reference**: for example "Commission Regulation (EU) 2022/63".
- **source**: source URL, `data_sources` row, `source_records` row (raw payload and hash).
- **source_quote**: the verbatim passage the rule came from. Required for curated rules; for bulk rules,
  the raw row is the record.
- **why**: one plain, reviewed line, optional.
- **last_checked_at**.
- **review_status**: draft, published or retired, with reviewer and review time.
- **History**: a changed rule creates a new row and retires the old one.

### 4. Checked place

A record that we checked a substance in a place and scope, and found no specific rule as of a date. This
is what lets the UI tell "checked, nothing specific" apart from "not covered".

List semantics matter here, and each importer must encode them:

- **Positive lists** (EU food additives, Canada permitted additives). Absence means the substance is not
  permitted as an additive in that scope. Presence may still be narrow: erythrosine (E127) is permitted in
  the EU only in a few foods, such as cocktail cherries.
- **Negative lists** (CosIng Annex II, Canada Hotlist, FDA prohibited cosmetic ingredients). Absence
  means no specific restriction.

Checked places come only from bulk lists, or from a curated review where the reviewer explicitly marks a
place as checked. In that case the review records which documents were read. A curated place is never
"checked" just because someone happened to supply a document.

### Positive-list absence

"Not on the EU additive list" is the "banned in Europe" story itself: potassium bromate and brominated
vegetable oil appear on no EU list. Taken literally, though, it would also make sugar, cocoa and caffeine
"not authorised as an additive", which is true but misleading.

- **When the importer creates a rule:** only for substances that are used as an additive somewhere. That
  means a substance with an E-number / INS, or one that another covered place lists as a food additive.
  Then a missing entry on a positive list becomes a rule with status **not authorised**, scoped to "food
  additive".
- **What the rule cites:** the list and its version, and as its legal basis the article saying only listed
  additives may be used (Article 4 of Regulation (EC) 1333/2008 for the EU). The source record is the list
  snapshot it was checked against.
- **Display:** "Not authorised as a food additive in the EU". It counts as noteworthy on the product page
  (see "What gets flagged").
- **Everything else** that is absent from a positive list gets no rule and no checked place.

### EU inheritance

- EU law applies in France, Germany and Italy. National rules are stored under the country.
- For a person in an EU country, their row shows the national rule if one exists. Otherwise it shows the
  EU rule, labelled as an EU rule.
- The UK is not the EU.

## Ingestion

### A. Bulk importers, one per official source

These are deterministic parsers, like the catalog importer:

1. Fetch the source, and store the raw file or response in `source_records` with its hash.
2. Parse it and upsert substances, aliases, rules and checked places.
3. Publish without row-by-row review: the official list is the authority.
4. Record `last_checked_at`.

Re-run cadence is my call: monthly, quarterly for CosIng. Changes create new rule versions.

### B. Curated path

This covers sources without a bulk format: French national rules, German and Italian botanicals, UK
specifics, the TGA, WADA, California, and the 100 researched ingredients.

1. An operator supplies official documents (URL or PDF) for a substance.
2. Claude (Sonnet 5.5, as elsewhere in research) proposes rules as structured JSON. Each rule includes
   the verbatim quote and where it appears.
3. Code checks that each quote appears in the fetched document text, after normalizing whitespace.
   Proposals that fail are dropped.
4. Proposals land as drafts.
5. A person approves them through a CLI review report (no admin UI in v1).
6. Only published rules are served. Claude is never asked for a rule without a source document in the
   prompt.

Phase 1 stores source hashes; the Phase 2 re-check job re-fetches sources and flags rules whose source
text changed.

## Matching products to substances

- **The label decides.** A product ingredient matches a substance through its own label name or E-number
  (exact, normalized, language-aware alias). Product-page notes come **only** from these direct matches.
  The canonical link is never used to attach a substance to a product row. "Turmeric" on a label must not
  pick up E100 additive rules.
- **The ingredient page** shows the rules of every substance linked to the canonical ingredient, grouped
  by substance when there is more than one. For example, under titanium dioxide: "As a food additive
  (E171)" and "As a cosmetic colour (CI 77891)".
- **Foods**: Open Food Facts hydration starts storing `additives_tags` on the product (for example in
  `products.extra_data`), and E-numbers match substances directly. This is the most reliable path for
  additives.
- **Cosmetics**: INCI names on the label match CosIng names.
- **No fuzzy matching in v1.** An unmatched name shows nothing.
- **Category to scope**: the product's category selects which scopes apply, through a reviewed mapping
  table in code:
  - food → food and food additive
  - supplement → supplement, food additive and sport. In the EU, supplements are foods, so the E171 ban
    covers supplement coatings.
  - cosmetic → cosmetic
  - otc → medicine and cosmetic. US sunscreens and skin-lightening creams sit here.

### Encoding rules that cross categories

- **Melatonin in the UK.** Encode it as scope "supplement", status prescription only, condition "classed
  as a medicine; not sold as a supplement". Encoding it as "medicine" would never reach a supplement
  product.
- **Hydroquinone in the US.** It has been prescription only since the 2020 change to over-the-counter
  drug rules. Encode it under both cosmetic and medicine scopes, so it reaches products categorised either
  way.
- **WADA.** Rules use scope "sport". They reach supplements through the mapping above, and they reach the
  ingredient page always.
- **California.** The device region gives a country, not a state. US users see California as its own row
  next to the federal row.

### What gets flagged on the product page

An ingredient row gets a `rule_note`, and counts toward `rules_glance`, only when a direct-match
substance has, in a scope the product's category maps to, one of these in any covered place:

- **banned**
- **not authorised**
- **prescription only**
- **warning label**
- **WADA prohibited**, on supplements

These never flag the product page; they are shown on the ingredient page only:

- **allowed with limits**: maximum levels, permitted food categories, allergen-labelling duties
- **approval required**
- **listed**
- **expert views**

Elory cannot tell whether a product is within a permitted use: its category is food or supplement, not
the EU food category.

Worked examples:

| Ingredient | Product page note | Ingredient page |
|---|---|---|
| Phenoxyethanol, sodium benzoate | No note | EU Annex V maximum shown as "allowed with limits" |
| Linalool, limonene | No note | EU allergen-labelling duty shown as "allowed with limits" |
| Carrageenan, phosphoric acid | No note | Limited to certain EU food categories |
| E171 in a candy | "Not authorised as a food additive in the EU" | US: "allowed with limits" (max 1%, 21 CFR 73.575) |
| Tartrazine (E102) | "Warning label required in the EU" | — |
| Erythrosine (E127) in a candy | "Banned in the US from 15 Jan 2027" (FDA revocation; California's AB 418 date also shown) | EU: "allowed with limits" (cocktail cherries only) |
| Melatonin supplement | "Prescription only in the UK" | — |

A future-dated ban flags now, with its date.

When several places flag, the row shows one note, chosen in this order:

1. The person's own place first.
2. Then by severity: banned, not authorised, prescription only, warning label.
3. Then EU before other places.

A "+N more" goes on the note when other places also flag.

## API

- **Ingredient detail** gains a `rules` block: a summary line, the person's place, `laws[]` and
  `expert_views[]`. Each item carries its display fields and source.
  - `us_regulatory_status` and `wada_status` stay populated for older app builds, the same approach as the
    claims work.
- **Rules-only substance view**: a substance with rules but no canonical ingredient needs its own endpoint,
  so a product row can open a rules-only screen.
- **Product detail**:
  - Each ingredient row gains an optional `rule_note`, a short text like "Banned in EU food".
  - The product gains `rules_glance`: counts where the person lives and elsewhere.
- **Country**: the app passes the person's country as a query parameter. My call: device region, with
  Canada as the fallback. A profile setting can come later. The builder picks `expo-localization` or
  `Intl`.
- **Summary line**: built by a deterministic template, never generated. It groups covered places by
  status for the most relevant scope, for example "Not authorised as a food additive in the EU. Allowed
  with limits in the US and Canada." It names only places with a rule or a checked place. Laws only.

### Condition text and language

- **Bulk rules.** The displayed condition comes from a deterministic template over structured fields:
  limit, unit, product type, warning text. Where the source's free text can't be reduced to a template,
  show the official English wording. CosIng and EUR-Lex publish in English. Bulk rules never get
  AI-written text.
- **Curated rules.** Claude proposes a short plain-English condition. For French, German or Italian
  sources this is a translation; the verbatim quote stays in the original language as evidence. The
  reviewer approves the English condition as part of the same review.

### Source terms

- Store only bare facts: classification, limit, date, legal reference. Always link to the source, with
  attribution.
- Never copy explanatory text from a source.
- If a source's terms forbid commercial reuse even of bare facts, it does not ship until the owner has
  checked with the publisher.
- IARC is the likely case. WHO material is often licensed for non-commercial use only, and Elory is a paid
  app even though rules are free.

## Screens

### Ingredient page

The existing "Regulatory status" section becomes **Rules**, placed directly under "What people believe /
What the evidence shows". My reasoning: "banned in Europe" is often why someone opened the page, and the
law and the studies should sit side by side.

- The summary line at the top.
- The person's country first, highlighted.
- **One row per place**:
  - a status word from the fixed vocabulary
  - what it covers
  - the condition
  - the date it took effect
- **Row detail** on tap: the legal reference, a link to the official page, when we last checked it, and
  the "why" line if there is one.
- **Expert views** sit in their own group below, styled differently. IARC rows carry fixed explainer copy:
  "This rates whether it can cause cancer, not how likely it is at normal amounts."
- **Coverage**: "No specific rule" appears only for checked places. Places we haven't covered are hidden.
- **Footer**: "Rules change. Last checked {date}. Not legal advice."
- If nothing is found and nothing is checked, the section is hidden.

### Rules-only screen

For a matched substance that isn't researched: the same Rules section, plus a "Not researched yet" note.
Product rows currently open `/ingredient/{id}` only when a canonical ingredient exists; this adds a
destination for substance-only matches.

### Product page

- An ingredient row gets a rule note only under the rules in "What gets flagged on the product page".
  Routine limits and "allowed" are not shown there.
- One line in "At a glance", such as "1 ingredient restricted where you live · 2 elsewhere". It is hidden
  when both counts are zero.

### Design system

Use the existing primitives (`components/ui`: Section, ListGroup, ListRow, Pill) and the September 2026
redesign. No new visual language.

## Verification and acceptance

- **Golden set.** About 20 substances, each expected rule checked by a person against the official source
  before it is used as a test oracle. Suggested set (the builder confirms each against its source):
  - titanium dioxide (E171), tartrazine (E102), erythrosine (E127)
  - potassium bromate, brominated vegetable oil, propylparaben (California AB 418)
  - aspartame (IARC 2B, 2023; JECFA acceptable daily intake)
  - red yeast rice / monacolin K (EU limits, 2022)
  - melatonin (differs across the US, UK, Canada and EU countries)
  - BHA, butylphenyl methylpropional (Lilial), triclosan, hydroquinone
  - parabens (CosIng Annex V), retinol (recent EU cosmetics limits)
- **Tests**:
  - importer parsers against fixture files
  - quote verification on the curated path
  - matching: ambiguous aliases stay unmatched; E-number matching
  - positive vs negative list semantics
  - EU inheritance display
  - future-dated rules
  - absence never rendered as "allowed"
  - the summary template
  - API contracts, including the legacy fields for older builds
- **Invariants**: no rule is served without `source_url` and `last_checked_at`. Drafts are never served.
- **Operations**:
  - Enable RLS on every new table. This production convention is not in alembic.
  - Run large imports out of band; deploys run `alembic upgrade head` under a 120 s healthcheck.

## Calls made in this design

These were not discussed in detail with the owner; check them while reading.

1. Rules attach to a separate substance record, not the curated ingredient list.
2. The Phase 1 source list and phase split above.
3. Bulk official lists publish without row-by-row review; curated rules need human approval.
4. Rules are free, not premium.
5. Country comes from the device region, with Canada as the fallback.
6. The EU row stands for member states unless a national rule exists.
7. The summary line covers laws only.
8. Curated rules are extracted by Claude from supplied documents, with a verbatim-quote check.
9. Absence from a positive list becomes "not authorised" only for substances used as an additive
   somewhere.
10. Only banned, not authorised, prescription only, warning label and WADA prohibited (on supplements)
    flag the product page. Routine limits and labelling duties stay on the ingredient page.
11. Product-page notes come only from the label's own names and E-numbers, never through the canonical
    ingredient link.
12. Bulk conditions use templates or the official English wording. Curated conditions are translated by
    Claude and approved by the reviewer.
13. Only bare facts with a link are stored from any source. A source whose terms forbid that does not
    ship until the owner has checked with the publisher.

14. The owner approves curated rules and golden-set oracles. (The owner was asked who should approve and
    hasn't said yet.)

## Release scope (owner's decision, 2026-11-04)

This release ships the tools **and** all the curated data, not the tools alone. "Done" includes:

- the 100 researched ingredients, across every Phase 1 place where a specific rule exists
- French national rules
- California AB 418
- re-sourced peptide statuses
- the golden-set oracles

The builder does the work up to approval:

1. Find the official documents.
2. Run the extraction.
3. Assemble the review report.

The owner approves. Expect roughly 300–600 curated rules: about 100 ingredients times 3–6 places that
have a specific rule each. That is a rough estimate. The review report has to make approval fast:

- grouped by ingredient
- the source quote beside the proposed rule
- approve or reject per rule, with a reason on reject
- resumable across sessions

The plan should schedule this review as its own milestone, so code work isn't blocked on it. Golden-set
oracles are approved first, because the tests depend on them.

## Left to the builder

- Table, column and endpoint names; migration split.
- Parser details per source, after the source checks above.
- Whether the review report is a CLI command or a script with a Makefile target.
- `expo-localization` vs `Intl` for device region.
- Exact UI copy beyond the fixed strings above, within the Sept 2026 design system.
