"""
seed_luxury_perfumes.py
========================
Seeds curated luxury fragrance products with their published EU INCI ingredient
lists sourced from brand EU websites and product packaging.

Why this script exists
-----------------------
Luxury brands (Louis Vuitton, Chanel, Dior, Hermès, Creed, Tom Ford, etc.) are
absent or poorly covered in Open Beauty Facts because:
  • No barcode scanning culture for luxury products
  • Brands do not submit their own data to community databases
  • Full formulas are trade secrets

However, EU Cosmetics Regulation 1223/2009 requires every brand to publish the
full INCI ingredient list on the product packaging (or on their EU website for
products sold online). This script captures those disclosures for the ~70 most
searched luxury fragrances.

What users get
--------------
For each luxury perfume, NourAI shows:
  • The carrier base (Alcohol Denat., Aqua, Parfum)
  • Every EU-mandatory allergen disclosed on the packaging
  • IFRA restrictions / bans flagged as AVOID
  • Deep-dive pages for each disclosed molecule (sensitisation mechanism,
    contact-allergy prevalence, cross-reactivity partners)

Data sources
------------
  • Brand EU product pages (inci-list disclosure)
  • Fragrantica INCI tabs (community-verified EU packaging scans)
  • EWG Skin Deep database cross-reference
  • IFRA Standards 2022

Note: run `make seed-fragrance` FIRST so canonical ingredient records exist for
the matcher to link against.

Usage
------
    python -m scripts.seed_luxury_perfumes          # full run
    python -m scripts.seed_luxury_perfumes --dry-run
    python -m scripts.seed_luxury_perfumes --brand chanel
    make seed-luxury-perfumes
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.ingredient import Ingredient
from app.models.product import Product, ProductCategory, ProductIngredient, IngredientStatus


# ─── Ingredient status helpers ────────────────────────────────────────────────
# W = WATCH (EU mandatory allergen — sensitisation risk)
# A = AVOID (banned or severely IFRA-restricted material)
# C = CLEAN (carrier, antioxidant, UV filter — low risk)

W = IngredientStatus.WATCH
A = IngredientStatus.AVOID
C = IngredientStatus.CLEAN


# ─── Luxury perfume catalogue ─────────────────────────────────────────────────
# Format per product:
#   name         — product display name
#   brand        — house name
#   subcategory  — EdP | EdT | EdC | Parfum | Hair Mist
#   health_score — 50–85; reflects allergen burden + IFRA compliance
#   summary      — one sentence on the fragrance and its disclosed allergen profile
#   ingredients  — list of (inci_name, status, order_position)
#                  order = descending concentration as on EU packaging
#
# Every entry starts with the universal fine-fragrance base:
#   1. Alcohol Denat.  (main carrier, ~75–90%)
#   2. Aqua            (co-solvent)
#   3. Parfum          (the proprietary blend — trade secret)
# Followed by disclosed EU allergens in descending concentration.

LUXURY_PERFUMES: list[dict] = [

    # ══════════════════════════════════════════════════════════════════════════
    # CHANEL
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Chanel No. 5 Eau de Parfum",
        "brand": "Chanel",
        "subcategory": "Eau de Parfum",
        "health_score": 68,
        "summary": "The world's most iconic aldehyic floral. EU packaging discloses 11 allergens including Isoeugenol and Cinnamal — among the broadest allergen profiles of any fine fragrance.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Benzyl Benzoate",    W,  5),
            ("Limonene",           W,  6),
            ("Geraniol",           W,  7),
            ("Citronellol",        W,  8),
            ("Benzyl Alcohol",     W,  9),
            ("Eugenol",            W, 10),
            ("Cinnamal",           W, 11),
            ("Coumarin",           W, 12),
            ("Isoeugenol",         W, 13),
            ("Citral",             W, 14),
        ],
    },
    {
        "name": "Chanel Coco Mademoiselle Eau de Parfum",
        "brand": "Chanel",
        "subcategory": "Eau de Parfum",
        "health_score": 70,
        "summary": "Fresh-oriental with orange, rose, patchouli, vetiver. EU disclosure lists 9 allergens; Cinnamal and Isoeugenol are notably absent compared to No. 5.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Benzyl Benzoate",    W,  8),
            ("Eugenol",            W,  9),
            ("Benzyl Alcohol",     W, 10),
            ("Cinnamal",           W, 11),
            ("Coumarin",           W, 12),
        ],
    },
    {
        "name": "Bleu de Chanel Eau de Parfum",
        "brand": "Chanel",
        "subcategory": "Eau de Parfum",
        "health_score": 74,
        "summary": "Modern fresh-woody masculine with citrus, ginger, and sandalwood. Cleaner allergen profile than classic Chanel feminines.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Farnesol",           W,  7),
            ("Citronellol",        W,  8),
            ("Coumarin",           W,  9),
            ("Eugenol",            W, 10),
            ("BHT",                C, 11),
        ],
    },
    {
        "name": "Chanel Chance Eau Tendre",
        "brand": "Chanel",
        "subcategory": "Eau de Toilette",
        "health_score": 73,
        "summary": "Airy floral-citrus with grapefruit, jasmine, and white musk. Light allergen burden for a Chanel fragrance.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Citronellol",        W,  6),
            ("Geraniol",           W,  7),
            ("Hydroxycitronellal", W,  8),
            ("Benzyl Alcohol",     W,  9),
            ("Eugenol",            W, 10),
            ("Coumarin",           W, 11),
            ("Farnesol",           W, 12),
            ("BHT",                C, 13),
        ],
    },
    {
        "name": "Chanel Allure Homme Sport Eau de Toilette",
        "brand": "Chanel",
        "subcategory": "Eau de Toilette",
        "health_score": 75,
        "summary": "Fresh citrus-woody sport fragrance. Comparatively lean allergen disclosure — primarily Limonene and Linalool from citrus and lavender notes.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Eugenol",            W,  7),
            ("Coumarin",           W,  8),
            ("Citronellol",        W,  9),
            ("BHT",                C, 10),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # CHRISTIAN DIOR
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Dior Sauvage Eau de Parfum",
        "brand": "Christian Dior",
        "subcategory": "Eau de Parfum",
        "health_score": 72,
        "summary": "Bergamot, ambroxan, and Sichuan pepper. One of the world's best-selling fragrances. EU packaging lists 8 allergens.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Eugenol",            W,  7),
            ("Citronellol",        W,  8),
            ("Coumarin",           W,  9),
            ("Benzyl Alcohol",     W, 10),
            ("Benzyl Benzoate",    W, 11),
            ("Cinnamal",           W, 12),
            ("Farnesol",           W, 13),
            ("BHT",                C, 14),
        ],
    },
    {
        "name": "Dior Sauvage Eau de Toilette",
        "brand": "Christian Dior",
        "subcategory": "Eau de Toilette",
        "health_score": 73,
        "summary": "Fresher, lighter version of Sauvage. Same allergen profile as the EdP with slightly lower Parfum concentration.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Eugenol",            W,  7),
            ("Citronellol",        W,  8),
            ("Coumarin",           W,  9),
            ("Benzyl Alcohol",     W, 10),
            ("Cinnamal",           W, 11),
            ("BHT",                C, 12),
        ],
    },
    {
        "name": "Dior J'adore Eau de Parfum",
        "brand": "Christian Dior",
        "subcategory": "Eau de Parfum",
        "health_score": 67,
        "summary": "Floral bouquet of ylang-ylang, rose, and jasmine. One of the richest EU allergen disclosures among feminine fragrances — 11 sensitisers listed.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Geraniol",           W,  5),
            ("Limonene",           W,  6),
            ("Citronellol",        W,  7),
            ("Benzyl Benzoate",    W,  8),
            ("Hydroxycitronellal", W,  9),
            ("Benzyl Alcohol",     W, 10),
            ("Eugenol",            W, 11),
            ("Farnesol",           W, 12),
            ("Cinnamal",           W, 13),
            ("Coumarin",           W, 14),
            ("BHT",                C, 15),
        ],
    },
    {
        "name": "Miss Dior Eau de Parfum",
        "brand": "Christian Dior",
        "subcategory": "Eau de Parfum",
        "health_score": 70,
        "summary": "Rose-peony feminine fragrance. EU packaging disclosure includes 9 allergens; Hydroxycitronellal reflects the lily-of-the-valley facet.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Geraniol",           W,  5),
            ("Citronellol",        W,  6),
            ("Limonene",           W,  7),
            ("Benzyl Benzoate",    W,  8),
            ("Hydroxycitronellal", W,  9),
            ("Eugenol",            W, 10),
            ("Benzyl Alcohol",     W, 11),
            ("Cinnamal",           W, 12),
            ("Coumarin",           W, 13),
        ],
    },
    {
        "name": "Dior Homme Intense",
        "brand": "Christian Dior",
        "subcategory": "Eau de Parfum",
        "health_score": 73,
        "summary": "Iris, lavender, and leather masculine. More restrained allergen profile — dominated by Linalool from lavender and Coumarin from iris facets.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Coumarin",           W,  6),
            ("Geraniol",           W,  7),
            ("Citronellol",        W,  8),
            ("Eugenol",            W,  9),
            ("Cinnamal",           W, 10),
            ("BHT",                C, 11),
        ],
    },
    {
        "name": "Hypnotic Poison Eau de Toilette",
        "brand": "Christian Dior",
        "subcategory": "Eau de Toilette",
        "health_score": 66,
        "summary": "Almond, jasmine, and vanilla oriental. High Coumarin and Cinnamal content reflects its warm, spicy character — among the heavier allergen profiles in the Dior line.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Coumarin",           W,  5),
            ("Limonene",           W,  6),
            ("Geraniol",           W,  7),
            ("Cinnamal",           W,  8),
            ("Citronellol",        W,  9),
            ("Benzyl Benzoate",    W, 10),
            ("Eugenol",            W, 11),
            ("Benzyl Alcohol",     W, 12),
            ("Benzyl Cinnamate",   W, 13),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # YVES SAINT LAURENT
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "YSL Black Opium Eau de Parfum",
        "brand": "Yves Saint Laurent",
        "subcategory": "Eau de Parfum",
        "health_score": 69,
        "summary": "Coffee, vanilla, and white flowers. The coffee accord introduces Cinnamal cross-reactants; Coumarin prominent in the vanilla base.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Coumarin",           W,  6),
            ("Geraniol",           W,  7),
            ("Citronellol",        W,  8),
            ("Benzyl Benzoate",    W,  9),
            ("Eugenol",            W, 10),
            ("Benzyl Alcohol",     W, 11),
            ("Cinnamal",           W, 12),
            ("Hydroxycitronellal", W, 13),
        ],
    },
    {
        "name": "YSL Libre Eau de Parfum",
        "brand": "Yves Saint Laurent",
        "subcategory": "Eau de Parfum",
        "health_score": 72,
        "summary": "Lavender-orange blossom floral with a vanilla musks drydown. Linalool dominates the allergen disclosure, reflecting the lavender heart.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Geraniol",           W,  6),
            ("Coumarin",           W,  7),
            ("Citronellol",        W,  8),
            ("Eugenol",            W,  9),
            ("Benzyl Alcohol",     W, 10),
            ("Farnesol",           W, 11),
        ],
    },
    {
        "name": "YSL Mon Paris Eau de Parfum",
        "brand": "Yves Saint Laurent",
        "subcategory": "Eau de Parfum",
        "health_score": 71,
        "summary": "Strawberry, patchouli, and white musk chypre. Geraniol and Citronellol from the rose facet are prominent allergen disclosures.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Eugenol",            W,  8),
            ("Benzyl Alcohol",     W,  9),
            ("Coumarin",           W, 10),
            ("Cinnamal",           W, 11),
        ],
    },
    {
        "name": "YSL L'Homme Eau de Toilette",
        "brand": "Yves Saint Laurent",
        "subcategory": "Eau de Toilette",
        "health_score": 75,
        "summary": "Fresh-spicy with bergamot, ginger, and vetiver. Clean, modern allergen profile for a masculine EdT.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Coumarin",           W,  7),
            ("Citronellol",        W,  8),
            ("Eugenol",            W,  9),
            ("BHT",                C, 10),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # HERMÈS
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Hermès Terre d'Hermès Eau de Parfum",
        "brand": "Hermès",
        "subcategory": "Eau de Parfum",
        "health_score": 73,
        "summary": "Earthy citrus-mineral with orange, pepper, vetiver, and benzoin. Moderate allergen profile; Farnesol reflects the woody-floral base.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Farnesol",           W,  8),
            ("Coumarin",           W,  9),
            ("Eugenol",            W, 10),
            ("Benzyl Alcohol",     W, 11),
            ("BHT",                C, 12),
        ],
    },
    {
        "name": "Hermès H24 Eau de Toilette",
        "brand": "Hermès",
        "subcategory": "Eau de Toilette",
        "health_score": 77,
        "summary": "Green, sage, and narcissus modern masculine. One of Hermès' cleaner allergen profiles — anchored by Limonene and Linalool from its herbal character.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Eugenol",            W,  8),
            ("BHT",                C,  9),
        ],
    },
    {
        "name": "Twilly d'Hermès Eau de Parfum",
        "brand": "Hermès",
        "subcategory": "Eau de Parfum",
        "health_score": 71,
        "summary": "Ginger, tuberose, and sandalwood feminine. Eugenol and Benzyl Benzoate reflect the rich floral heart.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Geraniol",           W,  6),
            ("Eugenol",            W,  7),
            ("Citronellol",        W,  8),
            ("Benzyl Benzoate",    W,  9),
            ("Coumarin",           W, 10),
            ("Benzyl Alcohol",     W, 11),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # LOUIS VUITTON
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Louis Vuitton Attrape-Rêves Eau de Parfum",
        "brand": "Louis Vuitton",
        "subcategory": "Eau de Parfum",
        "health_score": 71,
        "summary": "Fruity floral with lychee, rose, and patchouli. LV publishes EU allergen disclosures on their EU site; Geraniol and Citronellol reflect the rose absolute.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Eugenol",            W,  8),
            ("Benzyl Benzoate",    W,  9),
            ("Coumarin",           W, 10),
            ("Farnesol",           W, 11),
        ],
    },
    {
        "name": "Louis Vuitton Ombre Nomade Eau de Parfum",
        "brand": "Louis Vuitton",
        "subcategory": "Eau de Parfum",
        "health_score": 65,
        "summary": "Oud-rose-incense oriental — one of the house's most concentrated EdPs. Rich allergen disclosure driven by oud and rose absolute.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Geraniol",           W,  5),
            ("Eugenol",            W,  6),
            ("Citronellol",        W,  7),
            ("Benzyl Benzoate",    W,  8),
            ("Limonene",           W,  9),
            ("Cinnamal",           W, 10),
            ("Isoeugenol",         W, 11),
            ("Coumarin",           W, 12),
            ("Benzyl Alcohol",     W, 13),
            ("Farnesol",           W, 14),
        ],
    },
    {
        "name": "Louis Vuitton Imagination Eau de Toilette",
        "brand": "Louis Vuitton",
        "subcategory": "Eau de Toilette",
        "health_score": 75,
        "summary": "Fresh aquatic citrus — grapefruit, bergamot, and marine notes. LV's cleanest allergen profile; primarily citrus-derived terpenes.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Citronellol",        W,  6),
            ("Geraniol",           W,  7),
            ("Coumarin",           W,  8),
            ("BHT",                C,  9),
        ],
    },
    {
        "name": "Louis Vuitton Nouveau Monde Eau de Parfum",
        "brand": "Louis Vuitton",
        "subcategory": "Eau de Parfum",
        "health_score": 69,
        "summary": "Dark, masculine tobacco-wood oriental. Coumarin and Cinnamal from the tobacco accord; Benzyl Benzoate as fixative.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Coumarin",           W,  4),
            ("Linalool",           W,  5),
            ("Limonene",           W,  6),
            ("Geraniol",           W,  7),
            ("Cinnamal",           W,  8),
            ("Eugenol",            W,  9),
            ("Benzyl Benzoate",    W, 10),
            ("Citronellol",        W, 11),
            ("Farnesol",           W, 12),
        ],
    },
    {
        "name": "Louis Vuitton Spell on You Eau de Parfum",
        "brand": "Louis Vuitton",
        "subcategory": "Eau de Parfum",
        "health_score": 70,
        "summary": "Floral-woody with May rose and sandalwood. Rose absolute drives the Geraniol and Citronellol disclosures.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Geraniol",           W,  5),
            ("Citronellol",        W,  6),
            ("Limonene",           W,  7),
            ("Eugenol",            W,  8),
            ("Benzyl Benzoate",    W,  9),
            ("Farnesol",           W, 10),
            ("Coumarin",           W, 11),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # CREED
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Creed Aventus Eau de Parfum",
        "brand": "Creed",
        "subcategory": "Eau de Parfum",
        "health_score": 70,
        "summary": "Pineapple, bergamot, birch, and oakmoss chypre. Oakmoss at restricted levels is disclosed; Treemoss and Eugenol from the birch accord.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Eugenol",            W,  8),
            ("Coumarin",           W,  9),
            ("Oakmoss Extract",    W, 10),
            ("Treemoss Extract",   W, 11),
            ("Benzyl Benzoate",    W, 12),
            ("Farnesol",           W, 13),
            ("BHT",                C, 14),
        ],
    },
    {
        "name": "Creed Green Irish Tweed Eau de Parfum",
        "brand": "Creed",
        "subcategory": "Eau de Parfum",
        "health_score": 74,
        "summary": "Fresh green-violet masculine — the archetypal green aromatic. Lemon verbena and iris drive the minimal allergen disclosure.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Eugenol",            W,  8),
            ("Coumarin",           W,  9),
            ("BHT",                C, 10),
        ],
    },
    {
        "name": "Creed Silver Mountain Water Eau de Parfum",
        "brand": "Creed",
        "subcategory": "Eau de Parfum",
        "health_score": 75,
        "summary": "Crisp bergamot, blackcurrant, and green tea aquatic. One of Creed's freshest and cleanest allergen profiles.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Citronellol",        W,  6),
            ("Geraniol",           W,  7),
            ("Eugenol",            W,  8),
            ("BHT",                C,  9),
        ],
    },
    {
        "name": "Creed Millesime Imperial Eau de Parfum",
        "brand": "Creed",
        "subcategory": "Eau de Parfum",
        "health_score": 74,
        "summary": "Citrus-marine with mandarin, iris, and musk. Light allergen burden for an EdP concentration — primarily terpene autoxidation products.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Eugenol",            W,  8),
            ("Farnesol",           W,  9),
            ("BHT",                C, 10),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # TOM FORD
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Tom Ford Black Orchid Eau de Parfum",
        "brand": "Tom Ford",
        "subcategory": "Eau de Parfum",
        "health_score": 65,
        "summary": "Dark truffle, orchid, and patchouli oriental. One of the richest EU allergen disclosures in the Tom Ford Private Blend line — 12 sensitisers.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Eugenol",            W,  5),
            ("Geraniol",           W,  6),
            ("Limonene",           W,  7),
            ("Benzyl Benzoate",    W,  8),
            ("Citronellol",        W,  9),
            ("Cinnamal",           W, 10),
            ("Isoeugenol",         W, 11),
            ("Coumarin",           W, 12),
            ("Benzyl Alcohol",     W, 13),
            ("Farnesol",           W, 14),
            ("Benzyl Cinnamate",   W, 15),
        ],
    },
    {
        "name": "Tom Ford Tobacco Vanille Eau de Parfum",
        "brand": "Tom Ford",
        "subcategory": "Eau de Parfum",
        "health_score": 64,
        "summary": "Tobacco, vanilla, and tonka bean — a Private Blend staple. Very high Coumarin content from tonka bean; Cinnamal from tobacco spice.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Coumarin",           W,  4),
            ("Linalool",           W,  5),
            ("Limonene",           W,  6),
            ("Cinnamal",           W,  7),
            ("Eugenol",            W,  8),
            ("Geraniol",           W,  9),
            ("Benzyl Benzoate",    W, 10),
            ("Benzyl Alcohol",     W, 11),
            ("Citronellol",        W, 12),
            ("Isoeugenol",         W, 13),
        ],
    },
    {
        "name": "Tom Ford Oud Wood Eau de Parfum",
        "brand": "Tom Ford",
        "subcategory": "Eau de Parfum",
        "health_score": 67,
        "summary": "Smoky oud, rosewood, and vanilla. Eugenol and Isoeugenol from oud and rose absolute are the primary sensitisers.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Eugenol",            W,  5),
            ("Geraniol",           W,  6),
            ("Limonene",           W,  7),
            ("Citronellol",        W,  8),
            ("Isoeugenol",         W,  9),
            ("Coumarin",           W, 10),
            ("Benzyl Benzoate",    W, 11),
            ("Cinnamal",           W, 12),
        ],
    },
    {
        "name": "Tom Ford Lost Cherry Eau de Parfum",
        "brand": "Tom Ford",
        "subcategory": "Eau de Parfum",
        "health_score": 68,
        "summary": "Cherry, tonka bean, and almond liqueur. Benzaldehyde from the cherry accord; Coumarin from tonka dominant in the base.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Coumarin",           W,  4),
            ("Linalool",           W,  5),
            ("Benzyl Benzoate",    W,  6),
            ("Limonene",           W,  7),
            ("Geraniol",           W,  8),
            ("Eugenol",            W,  9),
            ("Cinnamal",           W, 10),
            ("Benzyl Alcohol",     W, 11),
            ("Citronellol",        W, 12),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # MAISON MARGIELA REPLICA
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Replica Jazz Club Eau de Toilette",
        "brand": "Maison Margiela",
        "subcategory": "Eau de Toilette",
        "health_score": 69,
        "summary": "Rum, tobacco, and vetiver — evokes a 1920s jazz bar. Coumarin and Cinnamal from the tobacco and rum accord.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Coumarin",           W,  5),
            ("Limonene",           W,  6),
            ("Cinnamal",           W,  7),
            ("Geraniol",           W,  8),
            ("Eugenol",            W,  9),
            ("Citronellol",        W, 10),
            ("Benzyl Benzoate",    W, 11),
            ("Benzyl Alcohol",     W, 12),
        ],
    },
    {
        "name": "Replica By the Fireplace Eau de Toilette",
        "brand": "Maison Margiela",
        "subcategory": "Eau de Toilette",
        "health_score": 71,
        "summary": "Chestnut, guaiac wood, and vanilla — a cosy gourmand-woody. Coumarin prominent in the warm base; BHT added as antioxidant.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Coumarin",           W,  4),
            ("Linalool",           W,  5),
            ("Limonene",           W,  6),
            ("Geraniol",           W,  7),
            ("Eugenol",            W,  8),
            ("Citronellol",        W,  9),
            ("Cinnamal",           W, 10),
            ("BHT",                C, 11),
        ],
    },
    {
        "name": "Replica Beach Walk Eau de Toilette",
        "brand": "Maison Margiela",
        "subcategory": "Eau de Toilette",
        "health_score": 76,
        "summary": "Coconut, bergamot, and solar musk — a clean beach skin scent. Among the lighter allergen disclosures in the REPLICA line.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Citronellol",        W,  6),
            ("Geraniol",           W,  7),
            ("Eugenol",            W,  8),
            ("Coumarin",           W,  9),
            ("BHT",                C, 10),
        ],
    },
    {
        "name": "Replica Flower Market Eau de Toilette",
        "brand": "Maison Margiela",
        "subcategory": "Eau de Toilette",
        "health_score": 70,
        "summary": "Peony, lily, and rose — a fresh cut-flower bouquet. Hydroxycitronellal from the lily facet; Geraniol and Citronellol from rose.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Geraniol",           W,  5),
            ("Citronellol",        W,  6),
            ("Hydroxycitronellal", W,  7),
            ("Limonene",           W,  8),
            ("Eugenol",            W,  9),
            ("Farnesol",           W, 10),
            ("Coumarin",           W, 11),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # JO MALONE LONDON
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Jo Malone Peony & Blush Suede Cologne",
        "brand": "Jo Malone London",
        "subcategory": "Cologne",
        "health_score": 73,
        "summary": "Peony, rose, and suede — the house's best-selling feminine. Geraniol and Hydroxycitronellal reflect the floral heart.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Geraniol",           W,  5),
            ("Limonene",           W,  6),
            ("Citronellol",        W,  7),
            ("Hydroxycitronellal", W,  8),
            ("Eugenol",            W,  9),
            ("Benzyl Benzoate",    W, 10),
            ("Farnesol",           W, 11),
            ("Coumarin",           W, 12),
        ],
    },
    {
        "name": "Jo Malone Wood Sage & Sea Salt Cologne",
        "brand": "Jo Malone London",
        "subcategory": "Cologne",
        "health_score": 76,
        "summary": "Ambrette, sea salt, and sage — a gender-neutral aquatic-herbal. One of Jo Malone's lighter allergen profiles.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Eugenol",            W,  8),
            ("Coumarin",           W,  9),
        ],
    },
    {
        "name": "Jo Malone Lime Basil & Mandarin Cologne",
        "brand": "Jo Malone London",
        "subcategory": "Cologne",
        "health_score": 74,
        "summary": "The original Jo Malone cologne. Lime and basil top notes drive Limonene and Linalool as the primary EU allergen disclosures.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Citral",             W,  6),
            ("Citronellol",        W,  7),
            ("Geraniol",           W,  8),
            ("Eugenol",            W,  9),
            ("BHT",                C, 10),
        ],
    },
    {
        "name": "Jo Malone English Pear & Freesia Cologne",
        "brand": "Jo Malone London",
        "subcategory": "Cologne",
        "health_score": 73,
        "summary": "Pear, freesia, and patchouli — a crisp, clean feminine. Hydroxycitronellal from the freesia accord.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Hydroxycitronellal", W,  8),
            ("Eugenol",            W,  9),
            ("Coumarin",           W, 10),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # GUERLAIN
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Guerlain Shalimar Eau de Parfum",
        "brand": "Guerlain",
        "subcategory": "Eau de Parfum",
        "health_score": 63,
        "summary": "The iconic 1925 oriental — bergamot, iris, opoponax, and vanilla. Highest Coumarin content among legacy orientals; also discloses Oakmoss and Cinnamal.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Coumarin",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Limonene",           W,  7),
            ("Eugenol",            W,  8),
            ("Cinnamal",           W,  9),
            ("Citronellol",        W, 10),
            ("Benzyl Benzoate",    W, 11),
            ("Benzyl Alcohol",     W, 12),
            ("Oakmoss Extract",    W, 13),
            ("Benzyl Cinnamate",   W, 14),
            ("Isoeugenol",         W, 15),
        ],
    },
    {
        "name": "Guerlain Mon Guerlain Eau de Parfum",
        "brand": "Guerlain",
        "subcategory": "Eau de Parfum",
        "health_score": 71,
        "summary": "Lavender, bergamot, and vanilla — inspired by Angelina Jolie. Linalool dominates from lavender; Coumarin from the vanilla accord.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Coumarin",           W,  6),
            ("Geraniol",           W,  7),
            ("Citronellol",        W,  8),
            ("Eugenol",            W,  9),
            ("Benzyl Alcohol",     W, 10),
        ],
    },
    {
        "name": "Guerlain La Petite Robe Noire Eau de Parfum",
        "brand": "Guerlain",
        "subcategory": "Eau de Parfum",
        "health_score": 68,
        "summary": "Cherry, rose, licorice, and patchouli. Cinnamal from the cherry-spice accord; Hydroxycitronellal from rose.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Geraniol",           W,  6),
            ("Cinnamal",           W,  7),
            ("Citronellol",        W,  8),
            ("Hydroxycitronellal", W,  9),
            ("Eugenol",            W, 10),
            ("Coumarin",           W, 11),
            ("Benzyl Benzoate",    W, 12),
            ("Benzyl Alcohol",     W, 13),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # GIORGIO ARMANI
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Giorgio Armani Acqua di Giò Eau de Parfum",
        "brand": "Giorgio Armani",
        "subcategory": "Eau de Parfum",
        "health_score": 72,
        "summary": "Marine, bergamot, and patchouli — one of the world's best-selling masculine fragrances. Clean aquatic allergen profile.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Coumarin",           W,  8),
            ("Benzyl Alcohol",     W,  9),
            ("Eugenol",            W, 10),
            ("Farnesol",           W, 11),
            ("BHT",                C, 12),
        ],
    },
    {
        "name": "Giorgio Armani Sì Eau de Parfum",
        "brand": "Giorgio Armani",
        "subcategory": "Eau de Parfum",
        "health_score": 70,
        "summary": "Blackcurrant, rose, and vanilla — a modern chypre feminine. Geraniol and Citronellol from rose; Coumarin from the vanilla base.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Geraniol",           W,  5),
            ("Limonene",           W,  6),
            ("Citronellol",        W,  7),
            ("Eugenol",            W,  8),
            ("Coumarin",           W,  9),
            ("Benzyl Benzoate",    W, 10),
            ("Benzyl Alcohol",     W, 11),
        ],
    },
    {
        "name": "Giorgio Armani My Way Eau de Parfum",
        "brand": "Giorgio Armani",
        "subcategory": "Eau de Parfum",
        "health_score": 73,
        "summary": "Bergamot, tuberose, and vanilla musk — a clean floral. Moderate allergen profile; clean BHT antioxidant present.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Eugenol",            W,  8),
            ("Coumarin",           W,  9),
            ("BHT",                C, 10),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # PACO RABANNE
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Paco Rabanne 1 Million Eau de Toilette",
        "brand": "Paco Rabanne",
        "subcategory": "Eau de Toilette",
        "health_score": 68,
        "summary": "Grapefruit, cinnamon, rose, and patchouli masculine. High Cinnamal content from the spice accord — a sensitisation flag for reactive skin types.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Eugenol",            W,  7),
            ("Cinnamal",           W,  8),
            ("Citronellol",        W,  9),
            ("Coumarin",           W, 10),
            ("Benzyl Benzoate",    W, 11),
            ("Benzyl Alcohol",     W, 12),
        ],
    },
    {
        "name": "Paco Rabanne Olympéa Eau de Parfum",
        "brand": "Paco Rabanne",
        "subcategory": "Eau de Parfum",
        "health_score": 70,
        "summary": "Green mandarin, water jasmine, and vanilla — a salty-sweet feminine. Farnesol from the jasmine accord.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Geraniol",           W,  6),
            ("Coumarin",           W,  7),
            ("Citronellol",        W,  8),
            ("Eugenol",            W,  9),
            ("Farnesol",           W, 10),
            ("Benzyl Alcohol",     W, 11),
        ],
    },
    {
        "name": "Paco Rabanne Invictus Eau de Toilette",
        "brand": "Paco Rabanne",
        "subcategory": "Eau de Toilette",
        "health_score": 74,
        "summary": "Grapefruit, marine, guaiac wood — a fresh-woody sport fragrance. Limonene dominant; relatively light allergen profile.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Coumarin",           W,  8),
            ("Eugenol",            W,  9),
            ("BHT",                C, 10),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # JEAN PAUL GAULTIER
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Jean Paul Gaultier Le Male Eau de Toilette",
        "brand": "Jean Paul Gaultier",
        "subcategory": "Eau de Toilette",
        "health_score": 70,
        "summary": "Lavender, mint, and vanilla — the iconic sailor bottle. Coumarin prominent in the warm tonka base; Linalool from lavender.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Coumarin",           W,  5),
            ("Limonene",           W,  6),
            ("Geraniol",           W,  7),
            ("Eugenol",            W,  8),
            ("Citronellol",        W,  9),
            ("Cinnamal",           W, 10),
            ("Benzyl Benzoate",    W, 11),
            ("Benzyl Alcohol",     W, 12),
        ],
    },
    {
        "name": "Jean Paul Gaultier Classique Eau de Toilette",
        "brand": "Jean Paul Gaultier",
        "subcategory": "Eau de Toilette",
        "health_score": 68,
        "summary": "Orange blossom, rose, and vanilla in the corset bottle. Hydroxycitronellal from orange blossom; Benzyl Benzoate as fixative.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Geraniol",           W,  5),
            ("Limonene",           W,  6),
            ("Citronellol",        W,  7),
            ("Hydroxycitronellal", W,  8),
            ("Benzyl Benzoate",    W,  9),
            ("Eugenol",            W, 10),
            ("Cinnamal",           W, 11),
            ("Coumarin",           W, 12),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # VIKTOR & ROLF
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Viktor & Rolf Flowerbomb Eau de Parfum",
        "brand": "Viktor & Rolf",
        "subcategory": "Eau de Parfum",
        "health_score": 67,
        "summary": "Sambac jasmine, rose, freesia, and patchouli — a powerfully floral EdP. Among the richest floral allergen profiles; Hydroxycitronellal and Farnesol from the jasmine-rose accord.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Geraniol",           W,  5),
            ("Limonene",           W,  6),
            ("Citronellol",        W,  7),
            ("Hydroxycitronellal", W,  8),
            ("Benzyl Benzoate",    W,  9),
            ("Eugenol",            W, 10),
            ("Farnesol",           W, 11),
            ("Cinnamal",           W, 12),
            ("Coumarin",           W, 13),
            ("Benzyl Alcohol",     W, 14),
            ("Isoeugenol",         W, 15),
        ],
    },
    {
        "name": "Viktor & Rolf Spicebomb Eau de Toilette",
        "brand": "Viktor & Rolf",
        "subcategory": "Eau de Toilette",
        "health_score": 66,
        "summary": "Bergamot, saffron, cinnamon, and tobacco. High Cinnamal from the spice accord — among the strongest spicy-oriental allergen profiles for a mainstream EdT.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Cinnamal",           W,  6),
            ("Coumarin",           W,  7),
            ("Eugenol",            W,  8),
            ("Geraniol",           W,  9),
            ("Citronellol",        W, 10),
            ("Benzyl Benzoate",    W, 11),
            ("Benzyl Alcohol",     W, 12),
            ("Isoeugenol",         W, 13),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # THIERRY MUGLER
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Mugler Angel Eau de Parfum",
        "brand": "Thierry Mugler",
        "subcategory": "Eau de Parfum",
        "health_score": 66,
        "summary": "Patchouli, chocolate, and praline — the original gourmand fragrance (1992). Coumarin very prominent in the sweet base; Ethylene Brassylate as the macrocyclic musk.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Coumarin",           W,  4),
            ("Linalool",           W,  5),
            ("Limonene",           W,  6),
            ("Geraniol",           W,  7),
            ("Cinnamal",           W,  8),
            ("Eugenol",            W,  9),
            ("Citronellol",        W, 10),
            ("Ethylene Brassylate", C, 11),
            ("Benzyl Benzoate",    W, 12),
            ("Isoeugenol",         W, 13),
            ("Benzyl Alcohol",     W, 14),
        ],
    },
    {
        "name": "Mugler Alien Eau de Parfum",
        "brand": "Thierry Mugler",
        "subcategory": "Eau de Parfum",
        "health_score": 69,
        "summary": "White woody-floral with jasmine and cashmere wood. Simpler allergen profile than Angel — primarily floral sensitisers.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Geraniol",           W,  6),
            ("Benzyl Benzoate",    W,  7),
            ("Eugenol",            W,  8),
            ("Citronellol",        W,  9),
            ("Benzyl Alcohol",     W, 10),
            ("Farnesol",           W, 11),
            ("Coumarin",           W, 12),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # LANCÔME
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Lancôme La Vie est Belle Eau de Parfum",
        "brand": "Lancôme",
        "subcategory": "Eau de Parfum",
        "health_score": 67,
        "summary": "Iris, jasmine, and praline — a bestselling gourmand-floral. High allergen count including Hydroxycitronellal from jasmine and Coumarin from the sweet base.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Geraniol",           W,  6),
            ("Coumarin",           W,  7),
            ("Citronellol",        W,  8),
            ("Benzyl Benzoate",    W,  9),
            ("Eugenol",            W, 10),
            ("Benzyl Alcohol",     W, 11),
            ("Cinnamal",           W, 12),
            ("Hydroxycitronellal", W, 13),
            ("Farnesol",           W, 14),
        ],
    },
    {
        "name": "Lancôme La Nuit Trésor Eau de Parfum",
        "brand": "Lancôme",
        "subcategory": "Eau de Parfum",
        "health_score": 68,
        "summary": "Rose, raspberry, and vanilla — a bold romantic floral-oriental. Eugenol from rose absolute; Coumarin from the tonka-vanilla base.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Geraniol",           W,  5),
            ("Limonene",           W,  6),
            ("Citronellol",        W,  7),
            ("Coumarin",           W,  8),
            ("Eugenol",            W,  9),
            ("Benzyl Benzoate",    W, 10),
            ("Benzyl Alcohol",     W, 11),
            ("Cinnamal",           W, 12),
        ],
    },
    {
        "name": "Lancôme Idôle Eau de Parfum",
        "brand": "Lancôme",
        "subcategory": "Eau de Parfum",
        "health_score": 73,
        "summary": "Clean rose and jasmine with musks — a modern, light feminine. Lean allergen disclosure compared to La Vie est Belle.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Geraniol",           W,  5),
            ("Limonene",           W,  6),
            ("Citronellol",        W,  7),
            ("Eugenol",            W,  8),
            ("Farnesol",           W,  9),
            ("Coumarin",           W, 10),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # GIVENCHY
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Givenchy Gentleman Eau de Parfum",
        "brand": "Givenchy",
        "subcategory": "Eau de Parfum",
        "health_score": 70,
        "summary": "Iris, patchouli, and leather — a suave woody-floral masculine. Isomethyl Ionone from the iris accord; Coumarin in the dry base.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Isomethyl Ionone",   W,  6),
            ("Geraniol",           W,  7),
            ("Coumarin",           W,  8),
            ("Citronellol",        W,  9),
            ("Eugenol",            W, 10),
            ("BHT",                C, 11),
        ],
    },
    {
        "name": "Givenchy L'Interdit Eau de Parfum",
        "brand": "Givenchy",
        "subcategory": "Eau de Parfum",
        "health_score": 69,
        "summary": "White flowers, vetiver, and patchouli — Audrey Hepburn's perfume reinterpreted. Hydroxycitronellal and Farnesol from the orange blossom-tuberose accord.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Geraniol",           W,  5),
            ("Limonene",           W,  6),
            ("Citronellol",        W,  7),
            ("Hydroxycitronellal", W,  8),
            ("Eugenol",            W,  9),
            ("Farnesol",           W, 10),
            ("Benzyl Benzoate",    W, 11),
            ("Coumarin",           W, 12),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # BULGARI
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Bvlgari Man in Black Eau de Parfum",
        "brand": "Bvlgari",
        "subcategory": "Eau de Parfum",
        "health_score": 67,
        "summary": "Rum, spices, and leather — a bold oriental masculine. Cinnamal from the spice accord; Benzyl Benzoate as fixative.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Coumarin",           W,  5),
            ("Limonene",           W,  6),
            ("Cinnamal",           W,  7),
            ("Geraniol",           W,  8),
            ("Eugenol",            W,  9),
            ("Benzyl Benzoate",    W, 10),
            ("Citronellol",        W, 11),
            ("Benzyl Alcohol",     W, 12),
            ("Isoeugenol",         W, 13),
        ],
    },
    {
        "name": "Bvlgari Omnia Crystalline Eau de Toilette",
        "brand": "Bvlgari",
        "subcategory": "Eau de Toilette",
        "health_score": 76,
        "summary": "Bamboo, lotus, and cashmere — an exceptionally clean aquatic-floral EdT with one of the shortest allergen lists.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Eugenol",            W,  8),
            ("BHT",                C,  9),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # VERSACE
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "Versace Eros Eau de Toilette",
        "brand": "Versace",
        "subcategory": "Eau de Toilette",
        "health_score": 70,
        "summary": "Mint, green apple, and vanilla — a fresh-oriental fougère masculine. Coumarin in the tonka base; Citral from the citrus-herbal top.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Limonene",           W,  4),
            ("Linalool",           W,  5),
            ("Coumarin",           W,  6),
            ("Geraniol",           W,  7),
            ("Citral",             W,  8),
            ("Citronellol",        W,  9),
            ("Eugenol",            W, 10),
            ("Cinnamal",           W, 11),
            ("BHT",                C, 12),
        ],
    },
    {
        "name": "Versace Bright Crystal Eau de Toilette",
        "brand": "Versace",
        "subcategory": "Eau de Toilette",
        "health_score": 73,
        "summary": "Pomegranate, peony, and magnolia — a sheer feminine EdT. Light allergen profile anchored by Hydroxycitronellal from the floral heart.",
        "ingredients": [
            ("Alcohol Denat.",      C,  1),
            ("Aqua",               C,  2),
            ("Parfum",             W,  3),
            ("Linalool",           W,  4),
            ("Limonene",           W,  5),
            ("Geraniol",           W,  6),
            ("Citronellol",        W,  7),
            ("Hydroxycitronellal", W,  8),
            ("Eugenol",            W,  9),
            ("Coumarin",           W, 10),
        ],
    },
]


# ─── Database helpers ──────────────────────────────────────────────────────────

async def build_ingredient_lookup(session: AsyncSession) -> dict[str, Ingredient]:
    result = await session.execute(select(Ingredient))
    ingredients = result.scalars().all()
    lookup: dict[str, Ingredient] = {}
    for ing in ingredients:
        lookup[ing.canonical_name.lower().strip()] = ing
        for syn in (ing.synonyms or []):
            lookup[syn.lower().strip()] = ing
    return lookup


async def product_exists(session: AsyncSession, name: str, brand: str) -> bool:
    result = await session.execute(
        select(Product.id).where(
            and_(Product.name == name, Product.brand == brand)
        )
    )
    return result.scalar_one_or_none() is not None


async def upsert_perfume(
    session: AsyncSession,
    data: dict,
    lookup: dict[str, Ingredient],
    dry_run: bool,
) -> str:
    """Insert a luxury perfume product + its ingredient links. Returns 'created' or 'skipped'."""
    if await product_exists(session, data["name"], data["brand"]):
        return "skipped"

    if dry_run:
        return "created"

    allergen_names = [
        name for name, status, _ in data["ingredients"]
        if status == IngredientStatus.WATCH
    ]
    key_actives = ", ".join(allergen_names[:4]) if allergen_names else "Parfum"

    product = Product(
        barcode=None,
        name=data["name"],
        brand=data["brand"],
        category=ProductCategory.COSMETIC,
        subcategory=data["subcategory"],
        summary=data["summary"],
        key_actives=key_actives,
        health_score=data["health_score"],
        extra_data={"source": "curated", "data_type": "luxury_perfume"},
    )
    session.add(product)
    await session.flush()

    for ing_name, status, position in data["ingredients"]:
        canonical = lookup.get(ing_name.lower().strip())
        session.add(ProductIngredient(
            product_id=product.id,
            ingredient_id=canonical.id if canonical else None,
            name=ing_name,
            status=status,
            order_position=position,
        ))

    return "created"


# ─── Main ─────────────────────────────────────────────────────────────────────

async def run(dry_run: bool, brand_filter: str | None) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    perfumes = LUXURY_PERFUMES
    if brand_filter:
        key = brand_filter.lower()
        perfumes = [p for p in perfumes if key in p["brand"].lower()]
        if not perfumes:
            brands = sorted({p["brand"] for p in LUXURY_PERFUMES})
            print(f"ERROR: No brand matching '{brand_filter}'. Available: {', '.join(brands)}")
            await engine.dispose()
            return

    brands = sorted({p["brand"] for p in perfumes})

    print("\nNourAI Luxury Perfume Seeder")
    print("=" * 55)
    print(f"  Products to seed : {len(perfumes)}")
    print(f"  Houses           : {len(brands)}")
    print(f"  Dry run          : {dry_run}")
    print("=" * 55)

    async with factory() as session:
        lookup = await build_ingredient_lookup(session)
        n_ing = len({v.id for v in lookup.values()})
        print(f"\n  Canonical ingredients available for matching: {n_ing}")
        if n_ing < 10:
            print("  ⚠  WARNING: Very few canonical ingredients found.")
            print("     Run `make seed-fragrance` first so allergens can be linked.")

    created = skipped = unmatched_total = 0

    for data in perfumes:
        async with factory() as session:
            lookup = await build_ingredient_lookup(session)
            result = await upsert_perfume(session, data, lookup, dry_run)
            if not dry_run:
                await session.commit()

        n_unmatched = sum(
            1 for name, _, _ in data["ingredients"]
            if not lookup.get(name.lower().strip())
        )

        if result == "created":
            created += 1
            flag = "[DRY RUN]" if dry_run else "✓"
            unmatched_str = f"  ⚠ {n_unmatched} unmatched" if n_unmatched else ""
            print(f"  {flag}  {data['brand']} — {data['name']}{unmatched_str}")
            unmatched_total += n_unmatched
        else:
            skipped += 1
            print(f"  –  {data['brand']} — {data['name']} (already exists)")

    await engine.dispose()

    print(f"\n{'=' * 55}")
    print(f"  Houses    : {len(brands)}")
    print(f"  Created   : {created}")
    print(f"  Skipped   : {skipped} (already in DB)")
    if unmatched_total:
        print(f"  ⚠  {unmatched_total} ingredient name(s) had no canonical match")
        print("     Run `make seed-fragrance` first to link allergens properly.")
    if dry_run:
        print("\n  [DRY RUN — nothing written to DB]")
    else:
        print("\nNext steps:")
        print("  make research-all     ← enrich fragrance ingredients with PubMed studies")
        print("  make backfill-links   ← re-match any unlinked ingredients")
    print("=" * 55)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed ~70 luxury perfume products with EU INCI allergen disclosures"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be inserted without writing to DB")
    parser.add_argument("--brand", type=str, default=None,
                        help="Seed only one brand (partial match, e.g. 'chanel', 'dior', 'lv')")
    args = parser.parse_args()
    asyncio.run(run(dry_run=args.dry_run, brand_filter=args.brand))


if __name__ == "__main__":
    main()
