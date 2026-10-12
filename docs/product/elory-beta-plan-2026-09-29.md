# Elory: product direction and beta release gates

29 September 2026. Source audit and first implementation pass; not a release certification.

> **Status, 12 October 2026.** This pass was written against the app before the September redesign and merged onto `main` on top of it. Landed: server-enforced premium (Atelier, chat, peptides) with RevenueCat reconciliation and `POST /users/me/subscription/verify`; account-scoped, server-authoritative stack with awaited add/remove; exact-period plan selection and no trial promise; premium screens mount only after verification. Tester builds (`EXPO_PUBLIC_TESTER_MODE=1`) still skip RevenueCat; the API grants them premium only when `PREMIUM_OPEN_BETA=true`. Still open: the redesign's home **stack score** and per-product grade badges are grade/ingredient arithmetic — the first P0 gate below.

## Product decision

Elory should help a person answer: **“Does this product add something useful to my routine, and what information would change that answer?”**

Start with adults reviewing everyday supplements and packaged foods. Keep cosmetics distinct by route and purpose. Treat Canada/English as a launch hypothesis until recruitment and catalogue coverage establish the actual first market. Avoid promising equal depth across every health domain, peptides, skincare and nutrition at launch.

A complete beta means one reliable loop: identify a product → understand evidence and uncertainty → add actual use to a routine → review overlap → choose an action → revisit what changed. Adding more destinations before this loop works increases unfinished surface area.

Preserve the current warm editorial UI. The differentiator should be the quality of the decision, not a more impressive health score.

## Competitive context, checked today

Yuka markets search, offline scanning, food preferences and unlimited history in Premium. Oasis foregrounds verified laboratory data. Scout describes category-specific scores. These are their public claims, not independent proof of accuracy or outcomes.

Sources: [Yuka Premium](https://yuka.io/en/premium-member/), [Oasis](https://www.oasishealth.app/), [Scout methodology](https://scouthealthapp.com/about).

Inference: scanning, ingredient explanations and a score alone are a weak subscription distinction. Elory's opportunity is to connect the person's actual use with evidence applicability, uncertainty and useful follow-up. Test this proposition; do not assume willingness to pay from competitor adoption.

The September 25 reports remain useful background. This document rechecks selected findings against current source; it does not repeat every older finding as a current defect.

## First changes implemented

- Home no longer calls the heuristic daily endpoint a longevity assessment or supplies an 82 fallback. It shows actual saved-product counts, missing amounts and a routine-review action. A saved product is explicitly distinguished from actual consumption.
- New-user home no longer fabricates scan history or numeric ratings. It has loading, empty, error and retry states, and a working history link. Removed the promotional article card whose omega-3 title linked to a creatine article.
- Stack no longer fabricates three products, an 86 summary score or grade-derived numerical scores. It shows missing amounts, an empty state and refresh failures. Nighttime products are no longer automatically classified as “as needed.”
- Removal now asks for confirmation, waits for the signed-in server operation before changing local state, and reports failure.
- Subscription selection matches both package type and billing duration. A missing annual package cannot silently purchase the monthly package. Prices come from the store and show the actual yearly/monthly period; fabricated prices, 35% savings and an unconditional seven-day trial promise are removed. Restore failures no longer look like “no purchases.”

This is foundational work, not completion of the premium product or scientific validation. Existing staged backend and asset edits were preserved.

## Release gates, in order

| Priority | Verified gap | Required behavior and acceptance evidence |
| --- | --- | --- |
| P0 | `biodomain_scorer.py` assigns full or half contribution for missing dose information and full contribution for incompatible units. | Unknown dose/application stays unknown. Separate evidence confidence, product completeness and applicability. No displayed health/longevity improvement derived from ingredient arithmetic. Review product and health-domain screens, not just home. Test absent amounts, incompatible units and oral/topical distinctions. |
| P0 | Product screen converts grades to numeric values and labels them evidence quality; evidence maturity counts are not a reliable evidence synthesis. | Each conclusion has a reviewed citation, study type, population, route, relevant dose/context, limitations and review date. Unknown and negative are distinct. Independent scientific review of launch claims. |
| P0 | `lib/revenue-cat.ts` configures a test key; Atelier's premium dependency is a no-op; premium layout mounts content while entitlement loading. | Platform/environment configuration, verified identity mapping, server enforcement, loading-safe UI and explicit development-only previews. Sandbox renewal, expiration, restore, refund, account switching and direct API requests tested. Do not activate paid beta until these pass. |
| P0 | Webhook handler expects an HMAC signature; lifecycle model does not check expiration in `is_premium`; cancellation changes status out of the allowed set immediately. | Reconcile the integration against the current RevenueCat contract. Authenticate genuine events, verify entitlement/environment, handle duplicate and out-of-order events, preserve paid-through access where applicable, revoke correctly, and reconcile missed events. Validate with actual sandbox event fixtures. |
| P0 | Stack hydration ignores empty server results and refuses to replace nonempty local state; meals are ephemeral. | Explicit saved-routine vs intake-log records, authoritative refresh, account isolation, durable writes and conflict policy. Restart, sign-out, second-device edits, deletion and failed-network scenarios verified. |
| P0 | Editorial article has strong uncited claims and an unverified physician attribution. | Verify authorship or replace with accurate editorial attribution; review and cite every launch article. Do not promote unreviewed material as scientific authority. |
| P1 | Notification preferences are local component state and advertise recalls/research alerts. | Implement persisted preferences and real delivery with opt-in, or remove those promises before beta. Show unavailable functionality honestly. |
| P1 | Account/privacy and purchase disclosures need end-to-end verification; paywall currently has a privacy link but no verified terms destination. | Verify deletion/export against actual stores, publish accurate privacy/terms/support destinations, and ensure subscription disclosures match configured offers. No invented legal assurances. |
| P1 | Product ingestion and laboratory improvements are present as staged work, not demonstrated catalogue coverage. | Curated launch catalogue benchmark: exact identity/market/variant, image, source date, ingredient completeness, corrections, and unknown barcode recovery. Lab findings expose tested batch and scope rather than implying every batch was tested. |
| P1 | No demonstrated recurring personal review loop. | Persist one chosen action; provide a weekly review of routine changes, unresolved questions and relevant reviewed evidence. Stable inputs should not generate artificial alerts or “improvements.” |

Key files: `nourai/app/product/[id].tsx`, `nourai/context/app-state.tsx`, `nourai/context/purchases-context.tsx`, `nourai/app/(premium)/_layout.tsx`, `backend-nourai/app/services/biodomain_scorer.py`, `backend-nourai/app/api/v1/atelier.py`, `backend-nourai/app/api/v1/webhooks/revenuecat.py`, `backend-nourai/app/models/subscription.py`.

## What makes Premium worth paying for

Proposed packaging, not implemented entitlements:

| Free | Premium recurring value |
| --- | --- |
| Product identification, ingredient facts and sources | Review across the whole routine with applicable evidence and explicit missing data |
| Clear limitations and applicable safety/context notices | Ingredient duplication and quantity-aware overlap review where data supports it |
| Basic saved routine and corrections | Comparable alternatives with transparent reasons, constraints and local availability |
| Access to/export of the person's own records | Weekly review of chosen actions and routine changes; relevant reviewed evidence updates |

Keep important limitations, applicable safety notices and cancellation accessible. Do not manufacture urgency or use hidden safety information to sell membership. “Nothing needs changing” and “you may not need another product” must be valid outcomes.

AI answers should cite the particular claim and indicate when the underlying data is insufficient. They should not supply confident personalized protocols from mechanisms alone. Peptides should not be a headline paid benefit in the initial release without a separately reviewed scope.

Do not lock the price yet. First measure whether users return for a routine decision after the first scan. Then test a localized monthly plan and transparent annual total against observed value and cost-to-serve. Costs include catalogue operations, scientific review, model use, support and store fees—not only hosting. Yuka's lower-priced utility model is a reason to prove additional value, not a reason to invent a discount.

## Next product increment: routine review

A useful review should contain:

1. **What you use:** exact product, amount, frequency and route; allow “I don't know.” Saved does not mean taken.
2. **What stands out:** at most three ranked findings with separate types: overlap, missing information, preference, supported relevance, or professional-review context.
3. **Why it matters:** the exact source, applicability conditions and uncertainty. A mechanism is not a measured personal benefit.
4. **One next step:** clarify an amount, review a duplicate, record a question for a pharmacist, or keep the routine unchanged. User chooses; no automatic medical protocol.
5. **Review later:** compare recorded changes and observations without attributing causality or showing invented biological progress.

Backend finding contract: stable ID, finding type, affected products/ingredients, evidence references, population/route/dose applicability, missing fields, confidence rationale, review/version metadata and proposed action. Store review snapshots so changed conclusions can be explained. Separate ingestion facts from reviewed claims and generated explanations.

## Beta acceptance and measurement

Proposed operational targets, to be agreed before recruiting; these are not scientific validation thresholds:

- Curate 50 representative launch products and 20 difficult scenarios: unknown barcode, regional variant, missing amount, unit mismatch, topical ingredient, duplicate ingredient, no relevant evidence and account/subscription edge cases.
- No fabricated personal results, silent failed mutations, unsupported trial promises or known critical access-control defects in that suite.
- Every surfaced personalized finding has a reviewable source and an explicit unknown state where needed.
- Test the full journey on iOS and Android, including physical-device camera permission/denial, poor connectivity, restart, text scaling and screen-reader navigation.
- Recruit 15–20 target users for a two-week qualitative beta after the technical/scientific gates pass. Ask them to make a real routine decision; do not ask whether the design looks premium.
- Track time to first useful decision, successful product resolution, repeat routine reviews, source comprehension, unresolved data issues and reported anxiety/confusion. Health outcomes and willingness to pay remain separate research questions.
- Ask “What does Elory know about your actual health?” and “What remains uncertain?” Incorrect certainty is a failure even if conversion improves.
- Record analytics event names and outcomes without copying health-profile text, chat messages or ingredient/medication details into general telemetry.

## Verification of this implementation pass

- TypeScript: `./node_modules/.bin/tsc --noEmit` passed.
- Three subscription selection regression tests passed: `node --test tests/subscription-plans.test.cjs`.
- Expo production iOS bundle export passed (1,721 modules), output `/tmp/elory-beta-ios-export`.
- Native interactive rendering, physical-device scans, backend integration and store purchases were not verified. A successful JavaScript bundle is not an end-to-end native test.
- No deployment, real purchase, scientific validation or complete beta certification was performed.

Billing implementation reference: [RevenueCat: displaying products](https://www.revenuecat.com/docs/getting-started/displaying-products). Price and duration should reflect the actual store product; introductory eligibility requires additional handling before any trial-specific promise.
