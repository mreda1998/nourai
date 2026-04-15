"""
seed_fragrance_ingredients.py
==============================
Seeds canonical fragrance ingredient records into the `ingredients` table.

Why this script exists
-----------------------
Perfume products fetched from Open Beauty Facts (via fetch_popular_products.py)
list ingredients as INCI names — primarily the EU 26 mandatory fragrance
allergens (Linalool, Limonene, Geraniol, Eugenol, etc.) plus carrier materials.

Without canonical ingredient records, `fetch_popular_products.py` cannot match
these names and all perfume ingredient rows will be name-only (no FK, no deep-
dive page). Running this script first fills the canonical table so the fetcher
can link perfume products to researched ingredients.

What this script seeds
-----------------------
• EU 26 mandatory fragrance allergens — required disclosure above 0.001% (leave-on)
  or 0.01% (rinse-off) per EU Cosmetics Regulation 1223/2009.
• Common fragrance carriers and fixatives (Alcohol Denat., Aqua, Parfum, etc.)
• Natural isolates commonly found in fine fragrances (Hedione, ISO E Super, etc.)
• IFRA-restricted and banned materials (Oakmoss, HICC, Lyral) — important for
  users with fragrance sensitisation.

All ingredients are seeded as research_status=PENDING so the research agent
(make research-all) will enrich them with PubMed evidence on contact
sensitization, IFRA restrictions, and patch-test data.

Usage
------
    python -m scripts.seed_fragrance_ingredients          # full run
    python -m scripts.seed_fragrance_ingredients --dry-run
    make seed-fragrance
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.ingredient import Ingredient, IngredientCategory, ResearchStatus


# ─── Fragrance ingredient catalogue ───────────────────────────────────────────
# Each entry: dict with all Ingredient fields.
# "synonyms" includes all INCI variants + common trade names so that
# fetch_popular_products.py can match them via the lookup dict.

FRAGRANCE_INGREDIENTS: list[dict] = [

    # ── Carrier / base materials ───────────────────────────────────────────────

    {
        "canonical_name": "Alcohol Denat.",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "alcohol denatured", "denatured alcohol", "ethanol denatured",
            "sd alcohol", "alcohol denaturé", "alcool dénaturé",
            "alcohol (denat.)", "ethyl alcohol denatured",
        ],
        "description": "Ethanol rendered undrinkable by denaturing agents — the primary carrier solvent in all fine fragrances.",
        "mechanism_summary": "High-proof ethanol (~96%) solubilises hydrophobic fragrance molecules and evaporates on skin contact, projecting the scent. Antimicrobial. Frequent application to the same skin area can disrupt the epidermal barrier.",
        "typical_dose_range": "60–90% in EdP/EdT/EdC",
        "side_effects": ["Skin dryness with chronic application to same area"],
        "contraindications": [],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Aqua",
        "category": IngredientCategory.OTHER,
        "synonyms": ["water", "eau", "wasser", "purified water", "deionized water"],
        "description": "Water — co-solvent in EdT and EdC formulations.",
        "mechanism_summary": "Polar co-solvent that dilutes alcohol concentration and can modulate fragrance evaporation rate.",
        "typical_dose_range": "5–30% in EdT / EdC; <5% in EdP",
        "side_effects": [],
        "contraindications": [],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Parfum",
        "category": IngredientCategory.OTHER,
        "synonyms": ["fragrance", "fragrance blend", "aroma", "perfume", "scent"],
        "description": "INCI catch-all term for the proprietary fragrance blend — a trade secret mixture of aroma chemicals and/or natural extracts.",
        "mechanism_summary": "Opaque by design. The blend may contain hundreds of molecules. Some individuals react to undisclosed allergens within the parfum blend. EU regulations require separate disclosure of the 26 known allergens even when listed under 'parfum'.",
        "typical_dose_range": "5–30% in EdP; 5–15% in EdT",
        "side_effects": ["Fragrance sensitisation", "Contact dermatitis in susceptible individuals"],
        "contraindications": ["Known fragrance allergy — check individual allergen disclosure"],
        "drug_interactions": [],
    },

    # ── EU 26 mandatory fragrance allergens ───────────────────────────────────
    # Required disclosure when present above 0.001% (leave-on) / 0.01% (rinse-off)
    # per EU Cosmetics Regulation 1223/2009, Annex III.

    {
        "canonical_name": "Linalool",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "linalol", "beta-linalool", "3,7-dimethyl-1,6-octadien-3-ol",
            "l-linalool", "d-linalool",
        ],
        "description": "Floral-lavender terpene alcohol found in over 200 plant species — one of the most used fragrance molecules globally.",
        "mechanism_summary": "Sensitisation occurs via autoxidation: linalool degrades on air exposure to linalool hydroperoxides and linalool oxide, both potent contact allergens. Fresh linalool is relatively well tolerated; aged or oxidised products are the primary risk. EU mandatory allergen.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on) / 0.01% (rinse-off)",
        "side_effects": ["Allergic contact dermatitis", "Sensitisation on repeated exposure to oxidised form"],
        "contraindications": ["Fragrance allergy", "Atopic dermatitis (heightened sensitisation risk)"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Limonene",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "d-limonene", "l-limonene", "(+)-limonene", "(-)-limonene",
            "citrus terpene", "dipentene",
        ],
        "description": "Citrus-scented monoterpene — the dominant aroma compound in orange, lemon, and lime peel. Ubiquitous in cleaning products, cosmetics, and fine fragrances.",
        "mechanism_summary": "Autoxidises to limonene hydroperoxide (LHP), an extremely potent sensitiser — one of the most common causes of fragrance contact allergy in European patch-test series. Fresh limonene is a weak sensitiser. Antioxidants in formulations slow oxidation.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on) / 0.01% (rinse-off)",
        "side_effects": ["Allergic contact dermatitis", "Phototoxicity (oxidised form)"],
        "contraindications": ["Fragrance allergy", "Citrus hypersensitivity"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Eugenol",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "4-allyl-2-methoxyphenol", "eugenic acid", "clove oil active",
            "2-methoxy-4-(2-propenyl)phenol",
        ],
        "description": "Spicy-clove phenolic compound from clove bud, cinnamon leaf, and ylang-ylang oils.",
        "mechanism_summary": "Strong direct sensitiser — electrophilic olefin and phenol react with skin protein nucleophiles (lysine, cysteine) without requiring metabolic activation. Consistently among the top contact allergens in fragrance patch testing worldwide. IFRA restricts to <0.5% in most leave-on product categories.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on); IFRA max 0.5% in category 4 (fine fragrance)",
        "side_effects": ["Allergic contact dermatitis", "Oral mucosa irritation at high concentrations"],
        "contraindications": ["Fragrance allergy", "Clove/spice hypersensitivity"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Geraniol",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "geranyl alcohol", "trans-geraniol", "3,7-dimethyl-2,6-octadien-1-ol",
            "nerol isomer",
        ],
        "description": "Sweet rose-like terpene alcohol found in geranium, palmarosa, citronella, and rose otto.",
        "mechanism_summary": "Sensitiser via Michael addition — the α,β-unsaturated system reacts with nucleophilic protein side chains forming geraniol–protein adducts. Top 10 fragrance allergen in European patch-test series. Also shows antimicrobial activity against gram-positive bacteria.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on)",
        "side_effects": ["Allergic contact dermatitis", "Sensitisation after repeated exposure"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Citronellol",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "beta-citronellol", "(±)-citronellol", "dihydrogeraniol",
            "3,7-dimethyl-6-octen-1-ol",
        ],
        "description": "Rosy-citrus terpene from citronella, rose, and geranium oils — widely used in floral fragrances.",
        "mechanism_summary": "Moderate sensitiser via oxidative metabolites (citronellal and related aldehydes). Present in most rose-type and citrus-floral fine fragrances. Structural similarity to geraniol means cross-reactivity is possible.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on)",
        "side_effects": ["Contact dermatitis in sensitised individuals"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Cinnamal",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "cinnamic aldehyde", "trans-cinnamaldehyde", "3-phenylpropenal",
            "cinnamaldehyde", "beta-phenylacrolein",
        ],
        "description": "Cinnamon-spice aldehyde — one of the most potent fragrance sensitisers and a frequent patch-test reactor.",
        "mechanism_summary": "Highly electrophilic α,β-unsaturated aldehyde that forms Schiff bases with skin protein lysine residues rapidly and at low concentrations. Among the top 5 fragrance contact allergens globally. IFRA restricts to <0.05% in fine fragrances (category 4).",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on); IFRA max 0.05% fine fragrance",
        "side_effects": ["Allergic contact dermatitis", "Occupational sensitisation (bakers, confectionery workers)"],
        "contraindications": ["Fragrance allergy", "Cinnamon hypersensitivity"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Isoeugenol",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "trans-isoeugenol", "2-methoxy-4-propenylphenol",
            "4-(1-propenyl)-2-methoxyphenol",
        ],
        "description": "Clove-carnation phenol — structural isomer of eugenol from ylang-ylang and clove oils.",
        "mechanism_summary": "Strong sensitiser metabolised to reactive ortho-quinone methide intermediates that alkylate protein nucleophiles. Higher sensitisation potency than eugenol. Banned in leave-on cosmetics in the EU from 2019 and restricted by IFRA in all product categories.",
        "typical_dose_range": "EU mandatory disclosure >0.001%; IFRA prohibited in most leave-on products",
        "side_effects": ["Allergic contact dermatitis", "Occupational sensitisation in fragrance workers"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Coumarin",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "2h-chromen-2-one", "1,2-benzopyrone", "tonka coumarin",
            "cis-o-coumaric acid lactone",
        ],
        "description": "Vanilla-hay-sweet lactone from tonka beans and sweet woodruff — the defining note of classic fougère fragrances.",
        "mechanism_summary": "Moderate sensitiser. EU mandatory allergen above 0.001%. Hepatotoxic at high oral doses (restricted in food). Some oestrogenic activity detected in in-vitro studies at supraphysiological concentrations — clinical relevance unclear at cosmetic exposure levels.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on); IFRA category 4 limit ~0.6%",
        "side_effects": ["Contact dermatitis", "Hepatotoxicity at very high oral doses"],
        "contraindications": ["Fragrance allergy", "Hepatic impairment (oral ingestion context)"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Benzyl Alcohol",
        "category": IngredientCategory.PRESERVATIVE,
        "synonyms": [
            "benzenemethanol", "phenylmethanol", "alpha-hydroxytoluene",
            "benzene carbinol",
        ],
        "description": "Mild aromatic alcohol used both as a preservative and as a natural fragrance component (jasmine, ylang-ylang).",
        "mechanism_summary": "Antimicrobial via bacterial cell membrane disruption. EU mandatory fragrance allergen when present as a scent ingredient. Generally well tolerated topically at <1%. High-dose IV exposure (premature neonates) linked to 'gasping syndrome' — irrelevant at topical fragrance concentrations.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on); cosmetic preservative max 1%",
        "side_effects": ["Contact dermatitis in sensitised individuals"],
        "contraindications": [],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Benzyl Benzoate",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "benzyl benzenecarboxylate", "ascabin", "benzoic acid benzyl ester",
        ],
        "description": "Fixative ester from balsams used in fine fragrances; also a pharmaceutical antiparasitic for scabies and lice.",
        "mechanism_summary": "In fragrances: plasticiser/fixative that retards volatilisation of top notes, extending longevity. EU mandatory allergen — moderate sensitisation risk in atopic individuals. Medically: disrupts arthropod nervous systems via GABA-A receptor modulation.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on)",
        "side_effects": ["Contact dermatitis", "Skin irritation at high concentrations"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Benzyl Cinnamate",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "benzyl trans-cinnamate", "cinnamein", "benzoic acid cinnamate ester",
        ],
        "description": "Sweet balsamic ester from Peru balsam and styrax — a classic base note fixative.",
        "mechanism_summary": "EU mandatory fragrance allergen. Moderate sensitiser — structurally related to cinnamal and can cross-react with it. Found in oriental and balsamic fragrances as a fixative component.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on)",
        "side_effects": ["Contact dermatitis", "Possible cross-reactivity with cinnamal"],
        "contraindications": ["Fragrance allergy", "Peru balsam hypersensitivity"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Amyl Cinnamal",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "alpha-amylcinnamaldehyde", "2-(phenylmethylidene)heptanal",
            "amylcinnamic aldehyde",
        ],
        "description": "Jasmine-type aldehyde — a widely-used floral middle note.",
        "mechanism_summary": "α,β-Unsaturated aldehyde sensitiser via Schiff base formation, similar to cinnamal. EU mandatory allergen. Moderate-to-strong sensitisation potential depending on oxidation state and concentration.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on)",
        "side_effects": ["Allergic contact dermatitis"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Amylcinnamyl Alcohol",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "alpha-amylcinnamyl alcohol", "2-benzylideneheptanol",
        ],
        "description": "Floral alcohol related to amyl cinnamal — jasmine/lily note used in fine fragrances.",
        "mechanism_summary": "EU mandatory fragrance allergen. Oxidises to its aldehyde (amyl cinnamal), increasing sensitisation potential on aging. Moderate contact allergen.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on)",
        "side_effects": ["Contact dermatitis"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Anise Alcohol",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "anisyl alcohol", "4-methoxybenzyl alcohol", "p-methoxybenzyl alcohol",
        ],
        "description": "Sweet anise-like benzyl alcohol derivative — used in floral and oriental fragrances.",
        "mechanism_summary": "EU mandatory allergen. Mild-to-moderate sensitiser. Structurally similar to benzyl alcohol but with a para-methoxy group that increases allergenic potential.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on)",
        "side_effects": ["Contact dermatitis in sensitised individuals"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Benzaldehyde",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "benzoic aldehyde", "phenylmethanal", "artificial almond oil",
        ],
        "description": "Cherry-almond aldehyde found naturally in bitter almonds and cherry pits.",
        "mechanism_summary": "Moderate sensitiser and irritant at high concentrations. Metabolised to benzoic acid in vivo. EU mandatory fragrance allergen disclosure required above threshold concentrations.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on)",
        "side_effects": ["Contact dermatitis", "Eye and mucous membrane irritation at high concentrations"],
        "contraindications": ["Fragrance allergy", "Almond hypersensitivity"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Cinnamyl Alcohol",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "3-phenyl-2-propen-1-ol", "styryl carbinol", "trans-cinnamyl alcohol",
        ],
        "description": "Balsamic floral alcohol — the reduced form of cinnamal, found in storax and cinnamon leaf.",
        "mechanism_summary": "Oxidises in air or on skin to cinnamal, which is the primary sensitiser. EU mandatory allergen. Sensitisation potential partially explained by in situ conversion to its aldehyde analogue.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on)",
        "side_effects": ["Contact dermatitis", "Cross-reactivity with cinnamal"],
        "contraindications": ["Fragrance allergy", "Cinnamon hypersensitivity"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Citral",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "geranial", "neral", "3,7-dimethyl-2,6-octadienal",
            "lemonal", "citral a", "citral b",
        ],
        "description": "Lemony-citrus aldehyde mixture (geranial + neral) from lemon grass, lemon myrtle, and citrus peel.",
        "mechanism_summary": "α,β-Unsaturated aldehyde sensitiser. EU mandatory allergen. Reacts with skin protein lysine and cysteine residues. Cross-reacts with geraniol (shares biosynthetic origin). One of the more common fragrance allergens in patch-test clinics.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on)",
        "side_effects": ["Allergic contact dermatitis"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Farnesol",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "(E,E)-farnesol", "trans,trans-farnesol", "3,7,11-trimethyl-2,6,10-dodecatrienol",
        ],
        "description": "Floral sesquiterpene alcohol from rose, lily, and ylang-ylang — also a natural deodorant active.",
        "mechanism_summary": "EU mandatory allergen. Moderate sensitiser with dose-dependent risk. Inhibits quorum sensing in bacteria (deodorant mechanism). Structurally complex 15-carbon terpene; sensitisation thought to occur via quinone methide intermediates.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on)",
        "side_effects": ["Contact dermatitis in fragrance-sensitive individuals"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Hexyl Cinnamal",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "alpha-hexylcinnamaldehyde", "hexyl cinnamic aldehyde",
            "2-(phenylmethylidene)octanal",
        ],
        "description": "Jasmine-apple aldehyde — one of the most widely used fragrance molecules in shampoos, detergents, and cosmetics.",
        "mechanism_summary": "α,β-Unsaturated aldehyde sensitiser, mechanistically similar to cinnamal. EU mandatory allergen. Common in mass-market products because of its cost-effectiveness and powerful jasmine odour. Prevalence in leave-on products makes it a frequent patch-test reactor.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on)",
        "side_effects": ["Allergic contact dermatitis"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Hydroxycitronellal",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "7-hydroxy-3,7-dimethyloctanal", "cyclamenaldehyde (structurally distinct)",
        ],
        "description": "Muguet (lily-of-the-valley) aldehyde — a classic fine fragrance ingredient with a clean, dewy floral character.",
        "mechanism_summary": "EU mandatory allergen. Moderate sensitiser via Schiff base formation. Commonly used in floral compositions; reduced usage trend following IFRA restrictions. Cross-reactivity with other aliphatic aldehydes.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on); IFRA limit 0.2% category 4",
        "side_effects": ["Contact dermatitis"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Isomethyl Ionone",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "gamma-methyl ionone", "orris-like ionone", "methyl ionone",
            "4-(2,6,6-trimethyl-2-cyclohexenyl)-3-buten-2-one isomers",
        ],
        "description": "Powdery violet-orris ketone used in cosmetics and fine fragrances.",
        "mechanism_summary": "EU mandatory allergen. Moderate sensitiser. α,β-Unsaturated ketone that reacts via Michael addition with skin nucleophiles. Found in baby products, personal care, and fine fragrances.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on)",
        "side_effects": ["Contact dermatitis"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Lilial",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "butylphenyl methylpropional", "BMHCA", "p-tert-butyl-alpha-methylhydrocinnamaldehyde",
            "2-(4-tert-butylbenzyl)propionaldehyde",
        ],
        "description": "Muguet-floral aldehyde — formerly one of the most-used fragrance molecules globally, now banned in the EU.",
        "mechanism_summary": "EU banned in cosmetics from March 2022 (Regulation 2021/1902) due to reprotoxicity (Category 1B) — shown to impair fertility in animal studies and suspected endocrine disruption. Previously an EU mandatory allergen. Products containing Lilial should not be used.",
        "typical_dose_range": "BANNED in EU cosmetics (2022)",
        "side_effects": ["Contact dermatitis", "Suspected reprotoxic effects", "Potential endocrine disruption"],
        "contraindications": ["Pregnancy", "Women of reproductive age", "Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Lyral",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "HICC", "hydroxyisohexyl 3-cyclohexene carboxaldehyde",
            "4-(4-hydroxy-4-methylpentyl)-3-cyclohexene-1-carboxaldehyde",
            "Lyral (INCI)",
        ],
        "description": "Muguet-lily aldehyde — one of the most common causes of fragrance contact allergy, now banned in the EU.",
        "mechanism_summary": "Extremely potent sensitiser — consistently the #1 or #2 fragrance allergen in European patch-test studies. Banned in EU cosmetics from August 2021 (Regulation 2020/1681). Cross-reacts with related cyclic aldehydes.",
        "typical_dose_range": "BANNED in EU cosmetics (2021)",
        "side_effects": ["Allergic contact dermatitis", "Occupational sensitisation"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Oakmoss Extract",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "evernia prunastri extract", "mousse de chene", "tree moss absolute",
        ],
        "description": "Earthy-mossy natural extract from lichen — a classic chypre and fougère base note, now heavily restricted.",
        "mechanism_summary": "Highly sensitising due to orcinol monomethyl ether, atranol, and chloroatranol — potent direct-acting allergens. EU restricted (Regulation 1223/2009); max 0.1% in fine fragrances, must be verified by patch test. WHO/IFRA: prohibited in most product categories.",
        "typical_dose_range": "EU max 0.1% in fine fragrance; IFRA prohibited in most categories",
        "side_effects": ["Allergic contact dermatitis", "Strong sensitisation potential"],
        "contraindications": ["Fragrance allergy", "Atopic dermatitis"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Treemoss Extract",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "evernia furfuracea extract", "pseudevernia furfuracea extract",
            "mousse d'arbre",
        ],
        "description": "Similar to oakmoss — a lichen absolute used in chypre bases, similarly restricted.",
        "mechanism_summary": "Contains chloroatranol and atranol as oakmoss; similar sensitisation mechanism. EU mandatory allergen and IFRA restricted. Often used as an oakmoss substitute but carries equivalent risk.",
        "typical_dose_range": "EU mandatory disclosure >0.001%; IFRA restricted",
        "side_effects": ["Allergic contact dermatitis"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Methyl 2-Octynoate",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "methyl octin carbonate", "methyl heptine carbonate (structurally distinct)",
            "methyl 2-nonynoate (related)",
        ],
        "description": "Violet-like acetylenic ester — used in trace amounts to lift and brighten floral compositions.",
        "mechanism_summary": "EU mandatory allergen. One of the strongest sensitisers on the list — active at extremely low concentrations (<0.002% in patch tests). Used in trace quantities (<0.01%) in professional fine fragrance compositions.",
        "typical_dose_range": "EU mandatory disclosure >0.001%; IFRA max 0.01% fine fragrance",
        "side_effects": ["Potent contact sensitiser even at trace concentrations"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Alpha-Isomethyl Ionone",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "alpha-methyl ionone", "isomethyl ionone",
        ],
        "description": "Orris-violet ionone used in fine fragrances and personal care — powdery floral note.",
        "mechanism_summary": "EU mandatory allergen. Moderate sensitiser. Alpha-beta unsaturated ketone with Michael acceptor reactivity. Cross-reacts with other ionone family members.",
        "typical_dose_range": "EU mandatory disclosure >0.001% (leave-on)",
        "side_effects": ["Contact dermatitis"],
        "contraindications": ["Fragrance allergy"],
        "drug_interactions": [],
    },

    # ── Common non-allergen fragrance materials ────────────────────────────────

    {
        "canonical_name": "Dihydromyrcenol",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "2,6-dimethyl-7-octen-2-ol", "dimethyl octanol",
        ],
        "description": "Fresh-marine terpene alcohol — a key aroma material in sport fragrances and colognes.",
        "mechanism_summary": "Low sensitisation potential. Not an EU mandatory allergen. Widely used in mass-market men's fragrances for its clean, fresh-citrus odour at very high concentrations.",
        "typical_dose_range": "Up to 30% in some mass-market EdT",
        "side_effects": ["Rare contact dermatitis at high concentrations"],
        "contraindications": [],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Iso E Super",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "1-(1,2,3,4,5,6,7,8-octahydro-2,3,8,8-tetramethyl-2-naphthalenyl)ethanone",
            "methyl cedryl ketone (approximate)", "Iso E Super (trade name)",
        ],
        "description": "Cedarwood-amber synthetic aroma chemical — the signature skin-scent enhancer in many modern niche perfumes.",
        "mechanism_summary": "Low toxicity. Not an EU mandatory allergen. Acts partly as an olfactive enhancer that boosts the projection of other fragrance materials at low concentrations. Polycyclic musks as a class are studied for bio-accumulation potential — Iso E Super has a relatively clean safety profile compared to nitro-musks.",
        "typical_dose_range": "0.5–40% in fine fragrances",
        "side_effects": ["Very rare contact dermatitis"],
        "contraindications": [],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Ethylene Brassylate",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "1,4-dioxacycloheptadecane-5,17-dione", "macrocyclic musk",
        ],
        "description": "Clean-laundry macrocyclic musk — widely used in detergents and fine fragrances as a skin-safe musk alternative.",
        "mechanism_summary": "Macrocyclic musks have a significantly better environmental and skin-safety profile than polycyclic and nitro-musks. Not bio-accumulative. Low sensitisation potential. Not an EU mandatory allergen.",
        "typical_dose_range": "1–10% in fine fragrances",
        "side_effects": ["Very rare contact dermatitis"],
        "contraindications": [],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Galaxolide",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "HHCB", "1,3,4,6,7,8-hexahydro-4,6,6,7,8,8-hexamethylcyclopenta[g]-2-benzopyran",
            "polycyclic musk HHCB",
        ],
        "description": "Synthetic polycyclic musk — sweet, powdery, laundry-clean scent. One of the most-used synthetic musks globally.",
        "mechanism_summary": "Polycyclic musk with known environmental persistence and bioaccumulation. Detected in human breast milk and adipose tissue. The EU and ECHA have flagged HHCB as a substance of very high concern (SVHC) under REACH. Low acute toxicity but chronic exposure accumulation is a concern.",
        "typical_dose_range": "0.5–10% in fragrances",
        "side_effects": ["Rare contact dermatitis", "Environmental persistence concerns"],
        "contraindications": ["Pregnancy (precautionary — bioaccumulation risk)"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "Hedione",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "methyl dihydrojasmonate", "MDJ", "methyl epi-dihydrojasmonate",
        ],
        "description": "Jasmine-diffusive ester — a pivotal molecule in modern perfumery; activates the human vomeronasal receptor VN1R1.",
        "mechanism_summary": "Activates VN1R1, a putative vomeronasal/pheromone receptor in humans — may contribute to subconscious olfactory signalling. Low sensitisation. Not an EU mandatory allergen. Key ingredient in Chanel No. 19 and many modern oriental/floral fragrances.",
        "typical_dose_range": "1–30% in fine fragrances",
        "side_effects": ["Very rare contact dermatitis"],
        "contraindications": [],
        "drug_interactions": [],
    },

    # ── UV filters / stabilisers ───────────────────────────────────────────────

    {
        "canonical_name": "Benzophenone-3",
        "category": IngredientCategory.OTHER,
        "synonyms": [
            "oxybenzone", "2-hydroxy-4-methoxybenzophenone",
            "eusolex 4360", "BP-3",
        ],
        "description": "UV filter used to protect fragrances from photodegradation — also a common sunscreen active.",
        "mechanism_summary": "Absorbs UVA/UVB radiation. Endocrine disruption concerns at high systemic exposures — detected in urine and breast milk after topical application. EU restricts to 0.5% in cosmetics (face); 6% body. Fragrance concentrations are typically well below dermal absorption thresholds but have accumulated in surface water.",
        "typical_dose_range": "0.1–0.5% in fine fragrances (UV protection); up to 6% in sunscreens",
        "side_effects": ["Contact and photocontact dermatitis", "Endocrine disruption at high systemic doses"],
        "contraindications": ["Known oxybenzone allergy"],
        "drug_interactions": [],
    },
    {
        "canonical_name": "BHT",
        "category": IngredientCategory.PRESERVATIVE,
        "synonyms": [
            "butylated hydroxytoluene", "2,6-di-tert-butyl-p-cresol",
            "dibutylhydroxytoluene",
        ],
        "description": "Synthetic antioxidant added to fragrances to prevent oxidation of terpene components (Linalool, Limonene) — thereby reducing allergen formation.",
        "mechanism_summary": "Radical chain-breaking antioxidant. Prevents autoxidation of terpenes to their more allergenic hydroperoxide forms. Low sensitisation potential. Some animal studies link high doses to hepatotoxicity; human relevance at cosmetic concentrations is uncertain.",
        "typical_dose_range": "0.01–0.1% as antioxidant in fragrance formulations",
        "side_effects": ["Very rare contact dermatitis"],
        "contraindications": [],
        "drug_interactions": [],
    },
]


# ─── Database helpers ──────────────────────────────────────────────────────────

async def load_existing(session: AsyncSession) -> dict[str, Ingredient]:
    """Build a lookup dict: lowercased canonical_name / synonym → Ingredient."""
    result = await session.execute(select(Ingredient))
    ingredients = result.scalars().all()
    lookup: dict[str, Ingredient] = {}
    for ing in ingredients:
        lookup[ing.canonical_name.lower().strip()] = ing
        for syn in (ing.synonyms or []):
            lookup[syn.lower().strip()] = ing
    return lookup


def find_existing(
    canonical_name: str,
    synonyms: list[str],
    lookup: dict[str, Ingredient],
) -> Ingredient | None:
    for key in [canonical_name] + synonyms:
        hit = lookup.get(key.lower().strip())
        if hit:
            return hit
    return None


async def upsert_ingredient(
    session: AsyncSession,
    data: dict,
    lookup: dict[str, Ingredient],
    dry_run: bool,
) -> str:
    """
    Insert a fragrance ingredient if it doesn't already exist.

    Returns 'created', 'skipped'.
    """
    existing = find_existing(
        data["canonical_name"],
        data.get("synonyms", []),
        lookup,
    )
    if existing:
        return "skipped"

    if dry_run:
        return "created"

    ing = Ingredient(
        canonical_name=data["canonical_name"],
        category=data["category"],
        synonyms=data.get("synonyms", []),
        description=data.get("description"),
        mechanism_summary=data.get("mechanism_summary"),
        typical_dose_range=data.get("typical_dose_range"),
        side_effects=data.get("side_effects", []),
        contraindications=data.get("contraindications", []),
        drug_interactions=data.get("drug_interactions", []),
        research_status=ResearchStatus.PENDING,
    )
    session.add(ing)
    await session.flush()

    # Update lookup so subsequent entries avoid duplicates
    lookup[ing.canonical_name.lower().strip()] = ing
    for syn in (ing.synonyms or []):
        lookup[syn.lower().strip()] = ing

    return "created"


# ─── Main ─────────────────────────────────────────────────────────────────────

async def run(dry_run: bool) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    print("\nNourAI Fragrance Ingredient Seeder")
    print("=" * 55)
    print(f"  Ingredients to seed : {len(FRAGRANCE_INGREDIENTS)}")
    print(f"  Dry run             : {dry_run}")
    print("=" * 55)

    async with factory() as session:
        lookup = await load_existing(session)
        n_existing = len({v.id for v in lookup.values()})
        print(f"\n  Existing canonical ingredients in DB: {n_existing}")

        created = 0
        skipped = 0

        for data in FRAGRANCE_INGREDIENTS:
            result = await upsert_ingredient(session, data, lookup, dry_run)
            if result == "created":
                created += 1
                status = "[DRY RUN]" if dry_run else "✓"
                print(f"  {status}  {data['canonical_name']}")
            else:
                skipped += 1
                print(f"  –  {data['canonical_name']} (already exists, skipped)")

        if not dry_run:
            await session.commit()

    await engine.dispose()

    print(f"\n{'=' * 55}")
    print(f"  Created : {created}")
    print(f"  Skipped : {skipped} (already in DB)")
    if dry_run:
        print("\n  [DRY RUN — nothing written to DB]")
    else:
        print("\nNext steps:")
        print("  make fetch-products     ← fetch perfume products from Open Beauty Facts")
        print("  make research-all       ← enrich new ingredients with PubMed studies")
        print("  make backfill-links     ← link perfume product ingredients to canonical table")
    print("=" * 55)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed canonical fragrance allergen + material ingredients"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be inserted without writing to DB")
    args = parser.parse_args()
    asyncio.run(run(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
