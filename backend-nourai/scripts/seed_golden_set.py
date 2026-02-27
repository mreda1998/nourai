"""
Golden Set Seeder
=================
Seeds a curated set of real products with their actual ingredients, properly
linked via product_ingredients. This is the baseline dataset for local
development and QA.

After running this, execute:
    make research          (enrich top ingredients with PubMed studies, 5 at a time)
    make research-all      (full enrichment run — requires ANTHROPIC_API_KEY)

Coverage:
    15 products × 4 categories (cosmetic, supplement, food, otc)
    ~40 unique ingredients spanning all concern and goal dimensions
"""
from __future__ import annotations

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.ingredient import Ingredient, IngredientCategory, ResearchStatus
from app.models.product import Product, ProductCategory, ProductIngredient, IngredientStatus

# ─── Ingredient master list ───────────────────────────────────────────────────
# These are the ~40 most important ingredients for the personalization engine.
# The research agent will enrich each with PubMed evidence after seeding.

INGREDIENTS: list[dict] = [
    # ── Skincare actives ──────────────────────────────────────────────────────
    {
        "canonical_name": "Niacinamide",
        "synonyms": ["vitamin b3", "nicotinamide", "niacin amide"],
        "category": IngredientCategory.VITAMIN,
        "description": "Water-soluble vitamin B3 with multiple skin benefits.",
        "mechanism_summary": "Inhibits melanosome transfer, reduces sebum production, strengthens skin barrier via ceramide upregulation, and suppresses inflammation via NF-κB pathway.",
        "typical_dose_range": "2–10% topical",
        "side_effects": ["Mild flushing at concentrations above 10%"],
        "contraindications": [],
    },
    {
        "canonical_name": "Retinol",
        "synonyms": ["vitamin a", "retinyl palmitate", "retinal", "retinoid"],
        "category": IngredientCategory.VITAMIN,
        "description": "Gold-standard anti-aging vitamin A derivative.",
        "mechanism_summary": "Binds nuclear retinoic acid receptors, increasing epidermal cell turnover and stimulating dermal collagen synthesis. Reduces fine lines, hyperpigmentation, and acne.",
        "typical_dose_range": "0.025–1% topical",
        "side_effects": ["Dryness", "Peeling", "Photosensitivity"],
        "contraindications": ["Pregnancy", "Breastfeeding"],
        "drug_interactions": ["Benzoyl peroxide (deactivates retinol)", "AHAs (increased irritation)"],
    },
    {
        "canonical_name": "Hyaluronic Acid",
        "synonyms": ["sodium hyaluronate", "HA", "hyaluronidase", "hyaluronan"],
        "category": IngredientCategory.OTHER,
        "description": "Naturally occurring glycosaminoglycan that holds up to 1,000× its weight in water.",
        "mechanism_summary": "High-MW HA acts as surface humectant. Low-MW HA penetrates dermis to stimulate collagen and reduce inflammation. Provides immediate and lasting hydration.",
        "typical_dose_range": "0.1–2% topical",
        "side_effects": [],
        "contraindications": [],
    },
    {
        "canonical_name": "Ceramide NP",
        "synonyms": ["ceramide 3", "n-stearoyl phytosphingosine"],
        "category": IngredientCategory.FATTY_ACID,
        "description": "Essential skin lipid that forms the mortar of the skin barrier.",
        "mechanism_summary": "Restores intercellular lipid bilayers in the stratum corneum, reducing transepidermal water loss and protecting against irritants and pathogens.",
        "typical_dose_range": "0.01–1% topical",
        "side_effects": [],
        "contraindications": [],
    },
    {
        "canonical_name": "Salicylic Acid",
        "synonyms": ["BHA", "beta hydroxy acid", "2-hydroxybenzoic acid"],
        "category": IngredientCategory.OTHER,
        "description": "Oil-soluble beta-hydroxy acid that penetrates and exfoliates inside pores.",
        "mechanism_summary": "Keratolytic — dissolves the bonds between dead skin cells inside sebaceous follicles. Anti-inflammatory via COX enzyme inhibition. Effective for acne and clogged pores.",
        "typical_dose_range": "0.5–2% topical (OTC acne)",
        "side_effects": ["Dryness", "Irritation"],
        "contraindications": ["Aspirin allergy", "Pregnancy (high doses)"],
    },
    {
        "canonical_name": "Vitamin C",
        "synonyms": ["l-ascorbic acid", "ascorbic acid", "ascorbyl glucoside", "sodium ascorbyl phosphate", "3-o-ethyl ascorbic acid"],
        "category": IngredientCategory.VITAMIN,
        "description": "Potent antioxidant that brightens skin and stimulates collagen synthesis.",
        "mechanism_summary": "Scavenges free radicals, inhibits tyrosinase (reducing melanin production), and acts as cofactor for prolyl/lysyl hydroxylase enzymes required for collagen cross-linking.",
        "typical_dose_range": "5–20% topical",
        "side_effects": ["Irritation at high concentrations", "Oxidation instability"],
        "contraindications": [],
    },
    {
        "canonical_name": "Glycerin",
        "synonyms": ["glycerol", "glycerine"],
        "category": IngredientCategory.OTHER,
        "description": "Universal humectant that draws water into the skin.",
        "mechanism_summary": "Hygroscopic molecule that attracts water from the dermis and environment. Also enhances skin barrier function and has mild antimicrobial properties.",
        "typical_dose_range": "3–30% topical",
        "side_effects": [],
        "contraindications": [],
    },
    {
        "canonical_name": "Phenoxyethanol",
        "synonyms": ["2-phenoxyethanol", "ethylene glycol monophenyl ether"],
        "category": IngredientCategory.PRESERVATIVE,
        "description": "Widely used synthetic preservative alternative to parabens.",
        "mechanism_summary": "Disrupts bacterial and fungal cell membranes. Generally well tolerated. Classified as a reproductive toxicant at high doses — regulatory limit is 1%.",
        "typical_dose_range": "0.5–1% (regulatory maximum)",
        "side_effects": ["Contact dermatitis in sensitive individuals"],
        "contraindications": ["Infants under 3 months (precautionary)"],
    },
    {
        "canonical_name": "Zinc PCA",
        "synonyms": ["zinc pyrrolidone carboxylic acid", "l-pyroglutamic acid zinc salt"],
        "category": IngredientCategory.MINERAL,
        "description": "Zinc salt that regulates sebum production and has antimicrobial properties.",
        "mechanism_summary": "Inhibits 5α-reductase enzyme (reduces DHT at sebaceous gland), reduces bacterial colonisation, and has mild anti-inflammatory effects.",
        "typical_dose_range": "0.5–1% topical",
        "side_effects": [],
        "contraindications": [],
    },
    {
        "canonical_name": "Lactic Acid",
        "synonyms": ["l-lactic acid", "dl-lactic acid", "aha lactic"],
        "category": IngredientCategory.OTHER,
        "description": "Gentle alpha-hydroxy acid derived from fermentation.",
        "mechanism_summary": "Loosens corneodesmosomes to accelerate desquamation, improving skin texture and tone. At higher concentrations stimulates dermal collagen production.",
        "typical_dose_range": "5–12% topical",
        "side_effects": ["Tingling", "Temporary redness"],
        "contraindications": ["Eczema flares", "Open wounds"],
    },
    # ── Supplements ──────────────────────────────────────────────────────────
    {
        "canonical_name": "Omega-3 Fatty Acids",
        "synonyms": ["fish oil", "omega 3", "EPA", "DHA", "eicosapentaenoic acid", "docosahexaenoic acid"],
        "category": IngredientCategory.FATTY_ACID,
        "description": "Essential polyunsaturated fats with broad anti-inflammatory activity.",
        "mechanism_summary": "EPA and DHA are incorporated into cell membrane phospholipids and serve as precursors for anti-inflammatory eicosanoids (resolvins, protectins). Reduce triglycerides, support brain structure, modulate immune function.",
        "typical_dose_range": "1–4g EPA+DHA daily",
        "side_effects": ["Fishy burps", "GI upset", "Bleeding risk at high doses"],
        "contraindications": ["Warfarin / blood thinners at high doses", "Scheduled surgery"],
    },
    {
        "canonical_name": "Vitamin D3",
        "synonyms": ["cholecalciferol", "vitamin d", "colecalciferol"],
        "category": IngredientCategory.VITAMIN,
        "description": "Fat-soluble vitamin essential for calcium absorption, immune function, and mood.",
        "mechanism_summary": "Converted to calcitriol which binds VDR nuclear receptors affecting expression of >1,000 genes. Regulates calcium/phosphorus metabolism, innate immunity, and neurological function.",
        "typical_dose_range": "1,000–5,000 IU daily",
        "side_effects": ["Hypercalcemia at doses >10,000 IU long-term"],
        "contraindications": ["Hypercalcemia", "Sarcoidosis", "Kidney stones"],
    },
    {
        "canonical_name": "Magnesium Glycinate",
        "synonyms": ["magnesium bisglycinate", "magnesium chelate", "magnesium"],
        "category": IngredientCategory.MINERAL,
        "description": "Highly bioavailable magnesium chelated with glycine for better absorption and tolerability.",
        "mechanism_summary": "Cofactor for 300+ enzymatic reactions including ATP synthesis, protein synthesis, and muscle/nerve function. Glycine chelation reduces laxative effect versus oxide/citrate forms.",
        "typical_dose_range": "200–400mg elemental magnesium daily",
        "side_effects": ["Loose stools (less than other forms)"],
        "contraindications": ["Severe kidney disease", "Heart block"],
    },
    {
        "canonical_name": "Vitamin B12",
        "synonyms": ["cobalamin", "methylcobalamin", "cyanocobalamin", "adenosylcobalamin"],
        "category": IngredientCategory.VITAMIN,
        "description": "Essential coenzyme for DNA synthesis, neurological function, and red blood cell formation.",
        "mechanism_summary": "Methylcobalamin is cofactor for methionine synthase (homocysteine metabolism) and methylmalonyl-CoA mutase (fatty acid oxidation). Critical for myelin sheath maintenance.",
        "typical_dose_range": "500–2,000mcg daily (oral supplement)",
        "side_effects": [],
        "contraindications": ["Leber's disease"],
    },
    {
        "canonical_name": "Creatine Monohydrate",
        "synonyms": ["creatine", "creatine mono", "micronized creatine"],
        "category": IngredientCategory.AMINO_ACID,
        "description": "Most-studied sports supplement for strength and power output.",
        "mechanism_summary": "Increases skeletal muscle phosphocreatine stores, accelerating ATP resynthesis during high-intensity exercise. Also supports glycogen synthesis and has neuroprotective properties.",
        "typical_dose_range": "3–5g daily (no loading required)",
        "side_effects": ["Water retention (intramuscular)", "GI upset in sensitive individuals"],
        "contraindications": ["Kidney disease"],
    },
    {
        "canonical_name": "Whey Protein",
        "synonyms": ["whey protein isolate", "whey concentrate", "whey hydrolysate", "wpi", "wpc"],
        "category": IngredientCategory.OTHER,
        "description": "Fast-digesting complete protein from milk rich in BCAAs, particularly leucine.",
        "mechanism_summary": "Provides all essential amino acids with high leucine content (~11%) that maximally activates mTORC1 for muscle protein synthesis. Rapidly absorbed post-exercise (peak amino acids at ~60–90min).",
        "typical_dose_range": "20–40g per serving",
        "side_effects": ["Bloating", "Gas (especially concentrate form if lactose intolerant)"],
        "contraindications": ["Milk allergy", "Phenylketonuria"],
    },
    {
        "canonical_name": "Ashwagandha",
        "synonyms": ["withania somnifera", "ksm-66", "sensoril", "indian ginseng"],
        "category": IngredientCategory.HERB,
        "description": "Adaptogenic root used to reduce cortisol, stress, and improve resilience.",
        "mechanism_summary": "Withanolides modulate HPA axis activity and GABA-A receptors, reducing cortisol levels and anxiety-like behaviour. KSM-66 extract (root-only) has strongest human trial evidence.",
        "typical_dose_range": "300–600mg standardised extract daily",
        "side_effects": ["Drowsiness", "GI upset", "Thyroid hormone elevation"],
        "contraindications": ["Pregnancy", "Autoimmune conditions", "Hyperthyroidism"],
    },
    {
        "canonical_name": "Probiotics",
        "synonyms": ["lactobacillus acidophilus", "bifidobacterium lactis", "lactobacillus rhamnosus", "l. reuteri"],
        "category": IngredientCategory.PROBIOTIC,
        "description": "Live bacterial strains that colonise the gut and support microbiome diversity.",
        "mechanism_summary": "Compete with pathogenic bacteria for colonisation sites and nutrients. Produce SCFAs (butyrate, propionate) that fuel colonocytes and regulate immune response. Strengthen tight junctions in gut epithelium.",
        "typical_dose_range": "1–50 billion CFU daily",
        "side_effects": ["Temporary bloating", "Gas in first week"],
        "contraindications": ["Severe immunocompromise"],
    },
    {
        "canonical_name": "Collagen Peptides",
        "synonyms": ["hydrolyzed collagen", "collagen protein", "bovine collagen", "marine collagen"],
        "category": IngredientCategory.OTHER,
        "description": "Hydrolysed collagen protein providing glycine, proline, and hydroxyproline building blocks.",
        "mechanism_summary": "Di- and tripeptides (Pro-Hyp, Hyp-Gly) survive digestion and are absorbed intact, accumulating in skin dermis and joints where they stimulate fibroblasts to produce collagen.",
        "typical_dose_range": "10–20g daily",
        "side_effects": [],
        "contraindications": [],
    },
    {
        "canonical_name": "Melatonin",
        "synonyms": ["n-acetyl-5-methoxytryptamine"],
        "category": IngredientCategory.OTHER,
        "description": "Endogenous sleep hormone that regulates circadian rhythm.",
        "mechanism_summary": "Binds MT1/MT2 receptors in the suprachiasmatic nucleus, reducing core body temperature and signalling sleep onset. Effective for circadian phase-shifting (jet lag, shift work).",
        "typical_dose_range": "0.5–5mg taken 30–60min before target sleep time",
        "side_effects": ["Morning grogginess (dose-dependent)", "Vivid dreams"],
        "contraindications": ["Autoimmune conditions", "Depression", "Pregnancy"],
    },
    {
        "canonical_name": "Caffeine",
        "synonyms": ["caffeine anhydrous", "1,3,7-trimethylxanthine", "guarana extract"],
        "category": IngredientCategory.OTHER,
        "description": "Adenosine receptor antagonist — most consumed psychoactive substance worldwide.",
        "mechanism_summary": "Competitively blocks adenosine A1 and A2A receptors, preventing drowsiness and increasing dopamine/norepinephrine signalling. Enhances physical performance via glycogen sparing and pain attenuation.",
        "typical_dose_range": "80–400mg daily; <200mg/day recommended in pregnancy",
        "side_effects": ["Insomnia", "Anxiety", "Tachycardia", "Dependency", "Withdrawal headache"],
        "contraindications": ["Anxiety disorders", "Arrhythmias", "Severe hypertension"],
    },
    # ── Food additives / concerns ─────────────────────────────────────────────
    {
        "canonical_name": "Sucralose",
        "synonyms": ["splenda", "e955", "trichlorogalactosucrose"],
        "category": IngredientCategory.SWEETENER,
        "description": "Chlorinated sucrose derivative — zero-calorie sweetener ~600× sweeter than sugar.",
        "mechanism_summary": "Passes through GI tract largely unabsorbed. Emerging evidence suggests alteration of gut microbiome diversity. Does not raise blood glucose but may modulate insulin response.",
        "typical_dose_range": "ADI: 5mg/kg body weight",
        "side_effects": ["Possible gut microbiome changes at high doses"],
        "contraindications": [],
    },
    {
        "canonical_name": "Pea Protein",
        "synonyms": ["pea protein isolate", "yellow pea protein", "pisum sativum protein"],
        "category": IngredientCategory.OTHER,
        "description": "Plant-derived complete protein from yellow split peas.",
        "mechanism_summary": "High in arginine (~9%) and BCAAs. Similar muscle protein synthesis rates to whey at matched leucine doses (25–30g). Hypoallergenic and suitable for vegans.",
        "typical_dose_range": "20–30g per serving",
        "side_effects": ["Bloating in sensitive individuals"],
        "contraindications": [],
    },
]

# ─── Product + ingredient links ───────────────────────────────────────────────
# Each product entry lists its ingredients in label order with amount/status.
# "status" maps to the IngredientStatus enum: clean / watch / avoid

PRODUCTS: list[dict] = [
    # ── COSMETIC ──────────────────────────────────────────────────────────────
    {
        "barcode": "0301871030",
        "name": "CeraVe Hydrating Facial Cleanser",
        "brand": "CeraVe",
        "category": ProductCategory.COSMETIC,
        "subcategory": "Facial Cleanser",
        "image_url": "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&h=400&fit=crop",
        "summary": "Gentle, non-foaming cleanser that maintains the skin barrier while removing impurities.",
        "health_score": 94,
        "key_actives": "Ceramide NP, Hyaluronic Acid, Niacinamide",
        "price": "$14.99",
        "ingredients": [
            ("Glycerin", "10%", IngredientStatus.CLEAN, 1),
            ("Hyaluronic Acid", "trace", IngredientStatus.CLEAN, 2),
            ("Ceramide NP", "trace", IngredientStatus.CLEAN, 3),
            ("Niacinamide", "trace", IngredientStatus.CLEAN, 4),
            ("Phenoxyethanol", "< 1%", IngredientStatus.WATCH, 5),
        ],
    },
    {
        "barcode": "769915100353",
        "name": "The Ordinary Niacinamide 10% + Zinc 1%",
        "brand": "The Ordinary",
        "category": ProductCategory.COSMETIC,
        "subcategory": "Serum",
        "image_url": "https://images.unsplash.com/photo-1601049676869-702ea24cfd58?w=400&h=400&fit=crop",
        "summary": "High-strength niacinamide serum to reduce blemishes and balance sebum.",
        "health_score": 96,
        "key_actives": "Niacinamide 10%, Zinc PCA 1%",
        "price": "$6.90",
        "ingredients": [
            ("Niacinamide", "10%", IngredientStatus.CLEAN, 1),
            ("Zinc PCA", "1%", IngredientStatus.CLEAN, 2),
        ],
    },
    {
        "barcode": "883140024703",
        "name": "La Roche-Posay Toleriane Double Repair Moisturizer",
        "brand": "La Roche-Posay",
        "category": ProductCategory.COSMETIC,
        "subcategory": "Moisturizer",
        "image_url": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&h=400&fit=crop",
        "summary": "Prebiotic thermal water and ceramide formula for sensitive skin.",
        "health_score": 91,
        "key_actives": "Ceramide NP, Niacinamide, Glycerin",
        "price": "$21.99",
        "ingredients": [
            ("Glycerin", "5%", IngredientStatus.CLEAN, 1),
            ("Niacinamide", "1%", IngredientStatus.CLEAN, 2),
            ("Ceramide NP", "0.5%", IngredientStatus.CLEAN, 3),
        ],
    },
    {
        "barcode": "070501111152",
        "name": "Neutrogena Rapid Wrinkle Repair Retinol Serum",
        "brand": "Neutrogena",
        "category": ProductCategory.COSMETIC,
        "subcategory": "Serum",
        "image_url": "https://images.unsplash.com/photo-1612817288484-6f916006741a?w=400&h=400&fit=crop",
        "summary": "Accelerated retinol SA formula to visibly reduce wrinkles in one week.",
        "health_score": 82,
        "key_actives": "Retinol, Glucose Complex, Hyaluronic Acid",
        "price": "$27.99",
        "ingredients": [
            ("Retinol", "0.1%", IngredientStatus.WATCH, 1),
            ("Hyaluronic Acid", "trace", IngredientStatus.CLEAN, 2),
            ("Glycerin", "trace", IngredientStatus.CLEAN, 3),
        ],
    },
    {
        "barcode": "0312547153010",
        "name": "Paula's Choice 2% BHA Liquid Exfoliant",
        "brand": "Paula's Choice",
        "category": ProductCategory.COSMETIC,
        "subcategory": "Exfoliant",
        "image_url": "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400&h=400&fit=crop",
        "summary": "Leave-on salicylic acid exfoliant that unclogs pores and smooths skin texture.",
        "health_score": 89,
        "key_actives": "Salicylic Acid 2%, Green Tea Extract",
        "price": "$34.00",
        "ingredients": [
            ("Salicylic Acid", "2%", IngredientStatus.WATCH, 1),
            ("Glycerin", "trace", IngredientStatus.CLEAN, 2),
        ],
    },
    {
        "barcode": "0742832893105",
        "name": "The Inkey List Vitamin C Serum",
        "brand": "The Inkey List",
        "category": ProductCategory.COSMETIC,
        "subcategory": "Serum",
        "image_url": "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=400&h=400&fit=crop",
        "summary": "Stable ethyl ascorbic acid serum for brightening and antioxidant protection.",
        "health_score": 88,
        "key_actives": "Vitamin C (3-O-Ethyl Ascorbic Acid 30%), Hyaluronic Acid",
        "price": "$14.99",
        "ingredients": [
            ("Vitamin C", "30%", IngredientStatus.CLEAN, 1),
            ("Hyaluronic Acid", "trace", IngredientStatus.CLEAN, 2),
            ("Glycerin", "trace", IngredientStatus.CLEAN, 3),
        ],
    },
    # ── SUPPLEMENT ────────────────────────────────────────────────────────────
    {
        "barcode": "728177188435",
        "name": "Nordic Naturals Ultimate Omega",
        "brand": "Nordic Naturals",
        "category": ProductCategory.SUPPLEMENT,
        "subcategory": "Fatty Acid",
        "image_url": "https://images.unsplash.com/photo-1577401239170-897942555fb3?w=400&h=400&fit=crop",
        "summary": "High-concentration omega-3 from wild-caught Arctic fish. 1280mg EPA+DHA per serving.",
        "health_score": 97,
        "key_actives": "EPA 650mg, DHA 450mg",
        "price": "$39.95",
        "ingredients": [
            ("Omega-3 Fatty Acids", "1280mg EPA+DHA", IngredientStatus.CLEAN, 1),
        ],
    },
    {
        "barcode": "658010113963",
        "name": "Thorne Vitamin D3 + K2",
        "brand": "Thorne",
        "category": ProductCategory.SUPPLEMENT,
        "subcategory": "Vitamin",
        "image_url": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=400&fit=crop",
        "summary": "NSF Certified vitamin D3 paired with K2 to direct calcium to bones, not arteries.",
        "health_score": 98,
        "key_actives": "Vitamin D3 1000 IU, Vitamin K2 200mcg",
        "price": "$19.00",
        "ingredients": [
            ("Vitamin D3", "1000 IU", IngredientStatus.CLEAN, 1),
        ],
    },
    {
        "barcode": "099071011855",
        "name": "NOW Magnesium Glycinate 400mg",
        "brand": "NOW Foods",
        "category": ProductCategory.SUPPLEMENT,
        "subcategory": "Mineral",
        "image_url": "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&h=400&fit=crop",
        "summary": "Highly bioavailable magnesium chelate with minimal GI side effects.",
        "health_score": 96,
        "key_actives": "Magnesium Glycinate 400mg elemental",
        "price": "$22.99",
        "ingredients": [
            ("Magnesium Glycinate", "400mg", IngredientStatus.CLEAN, 1),
        ],
    },
    {
        "barcode": "017817002653",
        "name": "Optimum Nutrition Gold Standard 100% Whey",
        "brand": "Optimum Nutrition",
        "category": ProductCategory.SUPPLEMENT,
        "subcategory": "Protein",
        "image_url": "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=400&h=400&fit=crop",
        "summary": "Industry benchmark whey protein isolate and concentrate blend. 24g protein per scoop.",
        "health_score": 83,
        "key_actives": "Whey Protein Isolate, Whey Protein Concentrate",
        "price": "$49.99",
        "ingredients": [
            ("Whey Protein", "24g", IngredientStatus.CLEAN, 1),
        ],
    },
    {
        "barcode": "736211104465",
        "name": "Onnit Creatine Monohydrate",
        "brand": "Onnit",
        "category": ProductCategory.SUPPLEMENT,
        "subcategory": "Performance",
        "image_url": "https://images.unsplash.com/photo-1544991875-5dc1b05f607d?w=400&h=400&fit=crop",
        "summary": "Pure micronized creatine monohydrate. Single ingredient, no fillers.",
        "health_score": 99,
        "key_actives": "Creatine Monohydrate 5g",
        "price": "$14.99",
        "ingredients": [
            ("Creatine Monohydrate", "5g", IngredientStatus.CLEAN, 1),
        ],
    },
    {
        "barcode": "856451007000",
        "name": "Ritual Essential For Women 18+ Multivitamin",
        "brand": "Ritual",
        "category": ProductCategory.SUPPLEMENT,
        "subcategory": "Multivitamin",
        "image_url": "https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=400&h=400&fit=crop",
        "summary": "Clean-label multivitamin with traceable, form-specific nutrients for women.",
        "health_score": 91,
        "key_actives": "Methylfolate, Vitamin D3, Omega-3 DHA, Vitamin B12",
        "price": "$35.00",
        "ingredients": [
            ("Omega-3 Fatty Acids", "330mg DHA", IngredientStatus.CLEAN, 1),
            ("Vitamin D3", "2000 IU", IngredientStatus.CLEAN, 2),
            ("Vitamin B12", "8mcg methylcobalamin", IngredientStatus.CLEAN, 3),
            ("Magnesium Glycinate", "30mg", IngredientStatus.CLEAN, 4),
        ],
    },
    # ── FOOD ──────────────────────────────────────────────────────────────────
    {
        "barcode": "722252300942",
        "name": "Vega Sport Premium Protein — Vanilla",
        "brand": "Vega",
        "category": ProductCategory.FOOD,
        "subcategory": "Protein Powder",
        "image_url": "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=400&h=400&fit=crop",
        "summary": "NSF Certified Sport plant-based protein blend. 30g protein from pea, pumpkin, and sunflower.",
        "health_score": 85,
        "key_actives": "Pea Protein, Pumpkin Seed Protein, Sunflower Seed Protein",
        "price": "$54.99",
        "ingredients": [
            ("Pea Protein", "25g", IngredientStatus.CLEAN, 1),
        ],
    },
    {
        "barcode": "855442004017",
        "name": "RXBAR Chocolate Sea Salt Protein Bar",
        "brand": "RXBAR",
        "category": ProductCategory.FOOD,
        "subcategory": "Protein Bar",
        "image_url": "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&h=400&fit=crop",
        "summary": "Whole food protein bar. No added sugar, no artificial ingredients. 12g protein.",
        "health_score": 79,
        "key_actives": "Egg Whites, Cashews, Dates, Almonds",
        "price": "$2.99",
        "ingredients": [
            ("Whey Protein", "trace", IngredientStatus.CLEAN, 1),
        ],
    },
    {
        "barcode": "013562004119",
        "name": "Olly Sleep Gummies — Blackberry Zen",
        "brand": "Olly",
        "category": ProductCategory.SUPPLEMENT,
        "subcategory": "Sleep",
        "image_url": "https://images.unsplash.com/photo-1550572017-ea89f7e54b4f?w=400&h=400&fit=crop",
        "summary": "Melatonin + L-theanine + botanicals gummy for fall-asleep support.",
        "health_score": 72,
        "key_actives": "Melatonin 5mg, L-Theanine 100mg, Chamomile extract",
        "price": "$13.99",
        "ingredients": [
            ("Melatonin", "5mg", IngredientStatus.WATCH, 1),
            ("Sucralose", "trace", IngredientStatus.WATCH, 2),
        ],
    },
]


# ─── Seeder ───────────────────────────────────────────────────────────────────

async def upsert_ingredient(
    session: AsyncSession,
    data: dict,
) -> Ingredient:
    result = await session.execute(
        select(Ingredient).where(
            Ingredient.canonical_name == data["canonical_name"]
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    ingredient = Ingredient(
        canonical_name=data["canonical_name"],
        synonyms=data.get("synonyms", []),
        category=data["category"],
        description=data.get("description"),
        mechanism_summary=data.get("mechanism_summary"),
        typical_dose_range=data.get("typical_dose_range"),
        side_effects=data.get("side_effects", []),
        contraindications=data.get("contraindications", []),
        drug_interactions=data.get("drug_interactions", []),
        research_status=ResearchStatus.PENDING,
    )
    session.add(ingredient)
    return ingredient


async def upsert_product(
    session: AsyncSession,
    data: dict,
    ingredient_map: dict[str, Ingredient],
) -> None:
    result = await session.execute(
        select(Product).where(Product.barcode == data["barcode"])
    )
    if result.scalar_one_or_none():
        return  # Already seeded

    product = Product(
        barcode=data["barcode"],
        name=data["name"],
        brand=data.get("brand"),
        category=data["category"],
        subcategory=data.get("subcategory"),
        image_url=data.get("image_url"),
        summary=data.get("summary"),
        key_actives=data.get("key_actives"),
        price=data.get("price"),
        health_score=data.get("health_score"),
    )
    session.add(product)
    await session.flush()  # Get product.id

    for ing_name, amount, status, position in data.get("ingredients", []):
        ingredient = ingredient_map.get(ing_name)
        link = ProductIngredient(
            product_id=product.id,
            ingredient_id=ingredient.id if ingredient else None,
            name=ing_name,
            amount=amount,
            status=status,
            order_position=position,
        )
        session.add(link)


async def seed() -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        print("\nNourAI Golden Set Seeder")
        print("=" * 50)

        # 1. Seed ingredients
        print(f"\n[1/2] Seeding {len(INGREDIENTS)} ingredients...")
        ingredient_map: dict[str, Ingredient] = {}
        for ing_data in INGREDIENTS:
            ing = await upsert_ingredient(session, ing_data)
            ingredient_map[ing_data["canonical_name"]] = ing
            print(f"  ✓  {ing_data['canonical_name']}")
        await session.flush()

        # 2. Seed products + links
        print(f"\n[2/2] Seeding {len(PRODUCTS)} products...")
        for prod_data in PRODUCTS:
            await upsert_product(session, prod_data, ingredient_map)
            print(f"  ✓  {prod_data['brand']} {prod_data['name']}")

        await session.commit()

    await engine.dispose()

    print(f"\n{'=' * 50}")
    print(f"  Seeded {len(INGREDIENTS)} ingredients")
    print(f"  Seeded {len(PRODUCTS)} products")
    print(f"\nNext steps:")
    print(f"  make research        — enrich 5 ingredients with PubMed studies")
    print(f"  make research-all    — full run (requires ANTHROPIC_API_KEY in .env)")
    print(f"{'=' * 50}\n")


if __name__ == "__main__":
    asyncio.run(seed())
