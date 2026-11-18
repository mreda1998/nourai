"""
Cosmetic reference tables, each entry tied to the source it rests on.

What lives here is curated, not generated: the contact allergens dermatology
patch-tests for, the UV filters and what they cover, the actives that have been
tested in people and at what strength, and the preservatives whose legal cap
lets us place the label's "1 % line". Every entry names a source in SOURCES.

Kept deliberately conservative: an ingredient that is not listed here is not
judged, and evidence strength follows the trials, not the marketing.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal
from urllib.parse import quote


def _pubmed(term: str) -> str:
    return f"https://pubmed.ncbi.nlm.nih.gov/?term={quote(term)}"


# ─── Sources ──────────────────────────────────────────────────────────────────

SOURCES: dict[str, tuple[str, str]] = {
    "eu_1223": ("Regulation (EC) No 1223/2009 on cosmetic products",
                "https://eur-lex.europa.eu/eli/reg/2009/1223/oj"),
    "us_701_3": ("21 CFR 701.3, cosmetic ingredient labelling",
                 "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-G/part-701/subpart-A/section-701.3"),
    "eu_2023_1545": ("Commission Regulation (EU) 2023/1545, fragrance allergen labelling",
                     "https://eur-lex.europa.eu/eli/reg/2023/1545/oj"),
    "sccs_fragrance": ("SCCS/1459/11, Opinion on fragrance allergens in cosmetic products",
                       "https://ec.europa.eu/health/scientific_committees/consumer_safety/docs/sccs_o_102.pdf"),
    "diepgen_2015": ("Diepgen TL et al., Br J Dermatol 2015: fragrance contact allergy in five European countries",
                     _pubmed("Diepgen prevalence of fragrance contact allergy general population five European countries")),
    "nacdg": ("DeKoven JG et al., Dermatitis 2023: North American Contact Dermatitis Group patch test results 2019–2020",
              _pubmed("North American Contact Dermatitis Group patch test results 2019-2020")),
    "eu_mi": ("Commission Regulation (EU) 2016/1198, methylisothiazolinone banned in leave-on products",
              "https://eur-lex.europa.eu/eli/reg/2016/1198/oj"),
    "eu_formaldehyde": ("Commission Regulation (EU) 2022/1181, “releases formaldehyde” labelling",
                        "https://eur-lex.europa.eu/eli/reg/2022/1181/oj"),
    "tupker_sls": ("Tupker RA et al., Contact Dermatitis 1997: guidelines on sodium lauryl sulfate irritation testing",
                   _pubmed("Tupker guidelines sodium lauryl sulfate irritation 1997")),
    "fda_sunscreen": ("FDA, OTC sunscreen proposed order (2021) and monograph M020",
                      "https://www.fda.gov/drugs/understanding-over-counter-medicines/questions-and-answers-fda-posts-deemed-final-order-and-proposed-order-over-counter-sunscreen"),
    "matta_2020": ("Matta MK et al., JAMA 2020: systemic absorption of sunscreen active ingredients",
                   _pubmed("Matta effect of sunscreen application on plasma concentration JAMA 2020")),
    "nambour_2011": ("Green AC et al., J Clin Oncol 2011: daily sunscreen and melanoma (Nambour trial)",
                     _pubmed("Green reduced melanoma after regular sunscreen use randomized trial follow-up")),
    "hughes_2013": ("Hughes MCB et al., Ann Intern Med 2013: sunscreen and skin aging (randomized trial)",
                    _pubmed("Hughes sunscreen and prevention of skin aging randomized trial")),
    "kockler_2012": ("Kockler J et al., J Photochem Photobiol C 2012: photostability of sunscreens",
                     _pubmed("Kockler photostability of sunscreens 2012")),
    "eu_oxybenzone": ("Commission Regulation (EU) 2022/1176, benzophenone-3 limits",
                      "https://eur-lex.europa.eu/eli/reg/2022/1176/oj"),
    "eu_homosalate": ("Commission Regulation (EU) 2022/2195, homosalate limited to face products",
                      "https://eur-lex.europa.eu/eli/reg/2022/2195/oj"),
    "fda_acne": ("21 CFR 333.310, OTC acne active ingredients",
                 "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-333/subpart-D/section-333.310"),
    "fda_aha": ("FDA, Alpha hydroxy acids in cosmetics (sun sensitivity)",
                "https://www.fda.gov/cosmetics/cosmetic-ingredients/alpha-hydroxy-acids"),
    "bozzo_2011": ("Bozzo P et al., Can Fam Physician 2011: safety of skin care products during pregnancy",
                   _pubmed("Bozzo safety of skin care products during pregnancy")),
    "kong_2016": ("Kong R et al., J Cosmet Dermatol 2016: retinol and retinoic acid in human skin",
                  _pubmed("Kong comparative study effects of retinol and retinoic acid human skin")),
    "mukherjee_2006": ("Mukherjee S et al., Clin Interv Aging 2006: retinoids in the treatment of skin aging",
                       _pubmed("Mukherjee retinoids in the treatment of skin aging")),
    "dhaliwal_2019": ("Dhaliwal S et al., Br J Dermatol 2019: bakuchiol vs retinol, randomized trial",
                      _pubmed("Dhaliwal bakuchiol retinol randomized double-blind")),
    "bissett_2005": ("Bissett DL et al., Dermatol Surg 2005: niacinamide and aging facial skin",
                     _pubmed("Bissett niacinamide B vitamin improves aging facial skin appearance")),
    "tanno_2000": ("Tanno O et al., Br J Dermatol 2000: nicotinamide and the skin barrier",
                   _pubmed("Tanno nicotinamide increases biosynthesis of ceramides")),
    "pinnell_2001": ("Pinnell SR et al., Dermatol Surg 2001: topical L-ascorbic acid percutaneous absorption",
                     _pubmed("Pinnell topical L-ascorbic acid percutaneous absorption studies")),
    "fluhr_2008": ("Fluhr JW et al., Br J Dermatol 2008: glycerol and the skin",
                   _pubmed("Fluhr glycerol and the skin holistic approach")),
    "chamlin_2002": ("Chamlin SL et al., J Am Acad Dermatol 2002: ceramide-dominant emollient in atopic dermatitis",
                     _pubmed("Chamlin ceramide-dominant physiologic lipid-based emollient atopic dermatitis")),
    "pan_2013": ("Pan M et al., Am J Clin Dermatol 2013: urea, a comprehensive review",
                 _pubmed("Pan urea comprehensive review clinical dermatology")),
    "pavicic_2011": ("Pavicic T et al., J Drugs Dermatol 2011: topical hyaluronic acid and hydration",
                     _pubmed("Pavicic efficacy of cream-based novel formulations of hyaluronic acid")),
    "proksch_2017": ("Proksch E et al., J Dermatolog Treat 2017: topical dexpanthenol",
                     _pubmed("Proksch topical use of dexpanthenol 70th anniversary")),
    "robinson_2005": ("Robinson LR et al., Int J Cosmet Sci 2005: topical palmitoyl pentapeptide",
                      _pubmed("Robinson topical palmitoyl pentapeptide provides improvement photoaged")),
    "bos_2000": ("Bos JD, Meinardi MM, Exp Dermatol 2000: the 500 dalton rule for skin penetration",
                 _pubmed("Bos Meinardi 500 Dalton rule skin penetration")),
    "azelaic": ("Schulte BC et al., Dermatol Ther 2015: azelaic acid, evidence-based update",
                _pubmed("azelaic acid evidence-based update on mechanism of action and clinical application")),
    "tranexamic": ("Taraz M et al., Dermatol Ther 2017: tranexamic acid in melasma, review",
                   _pubmed("tranexamic acid melasma comprehensive review clinical studies")),
    "centella": ("Bylka W et al., Postepy Dermatol Alergol 2013: Centella asiatica in cosmetology",
                 _pubmed("Bylka Centella asiatica in cosmetology")),
    "sccs_parabens": ("Commission Regulations (EU) 1004/2014 and 358/2014, paraben limits and bans",
                      "https://eur-lex.europa.eu/eli/reg/2014/1004/oj"),
    "sccs_phenoxyethanol": ("SCCS/1575/16, Opinion on phenoxyethanol (safe up to 1 %)",
                            _pubmed("SCCS opinion phenoxyethanol 2016")),
    "eu_d4d5": ("Commission Regulation (EU) 2018/35, D4 and D5 in wash-off cosmetics",
                "https://eur-lex.europa.eu/eli/reg/2018/35/oj"),
    "lachenmeier_2008": ("Lachenmeier DW, J Occup Med Toxicol 2008: safety of topical ethanol",
                         _pubmed("Lachenmeier safety evaluation of topical applications of ethanol on the skin")),
}


# ─── Matching ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class Match:
    """Whole-word phrases; any one of them names the ingredient."""
    terms: tuple[str, ...]


# ─── Contact allergens and irritants ──────────────────────────────────────────

AllergenLevel = Literal["frequent", "listed", "irritant", "photo"]


@dataclass(frozen=True, slots=True)
class Allergen:
    name: str
    terms: tuple[str, ...]
    level: AllergenLevel
    note: str
    source: str
    leave_on_banned_eu: bool = False


ALLERGENS: tuple[Allergen, ...] = (
    # Frequent: among the top positives in dermatology patch-test clinics.
    Allergen("Methylisothiazolinone", ("methylisothiazolinone",), "frequent",
             "One of the most frequent preservative allergies seen in clinics. Banned in leave-on products in the EU since 2017.",
             "eu_mi", leave_on_banned_eu=True),
    Allergen("Methylchloroisothiazolinone", ("methylchloroisothiazolinone",), "frequent",
             "Sold mixed with methylisothiazolinone; the mixture is a frequent allergy and is banned in EU leave-on products.",
             "eu_mi", leave_on_banned_eu=True),
    Allergen("Formaldehyde releaser", ("dmdm hydantoin", "quaternium-15", "quaternium 15", "imidazolidinyl urea",
                                       "diazolidinyl urea", "bronopol", "2-bromo-2-nitropropane-1,3-diol",
                                       "sodium hydroxymethylglycinate", "formaldehyde", "methenamine"), "frequent",
             "Slowly releases formaldehyde, a common contact allergen. EU labels must say “releases formaldehyde” above 0.001 %.",
             "eu_formaldehyde"),
    Allergen("Hair dye allergen", ("p-phenylenediamine", "phenylenediamine", "toluene-2,5-diamine",
                                   "toluene-2,5-diamine sulfate"), "frequent",
             "A strong sensitiser behind most hair-dye reactions. EU labels must carry a patch-test warning.",
             "nacdg"),
    Allergen("Fragrance", ("fragrance", "parfum", "perfume", "aroma"), "frequent",
             "An undisclosed blend. Fragrance is the most common cause of cosmetic contact allergy, affecting a few percent of adults.",
             "diepgen_2015"),
    Allergen("Oakmoss / treemoss", ("evernia prunastri", "evernia furfuracea", "oakmoss", "oak moss", "treemoss"), "frequent",
             "Among the strongest fragrance allergens; heavily restricted in the EU.", "sccs_fragrance"),
    Allergen("Isoeugenol", ("isoeugenol",), "frequent",
             "An established fragrance allergen in people, capped in the EU.", "sccs_fragrance"),
    Allergen("Cinnamal", ("cinnamal", "cinnamaldehyde", "cinnamic aldehyde"), "frequent",
             "An established fragrance allergen in people.", "sccs_fragrance"),
    Allergen("Hydroxycitronellal", ("hydroxycitronellal",), "frequent",
             "An established fragrance allergen in people.", "sccs_fragrance"),
    # Listed: must be named on EU labels above 0.001 % (leave-on) or 0.01 % (rinse-off).
    *(Allergen(n, t, "listed", "A fragrance allergen the EU requires on the label above trace levels.", "eu_2023_1545")
      for n, t in (
          ("Linalool", ("linalool",)), ("Limonene", ("limonene", "d-limonene")), ("Citronellol", ("citronellol",)),
          ("Geraniol", ("geraniol",)), ("Citral", ("citral",)), ("Eugenol", ("eugenol",)), ("Coumarin", ("coumarin",)),
          ("Benzyl salicylate", ("benzyl salicylate",)), ("Benzyl benzoate", ("benzyl benzoate",)),
          ("Benzyl cinnamate", ("benzyl cinnamate",)), ("Hexyl cinnamal", ("hexyl cinnamal",)),
          ("Amyl cinnamal", ("amyl cinnamal",)), ("Amylcinnamyl alcohol", ("amylcinnamyl alcohol",)),
          ("Cinnamyl alcohol", ("cinnamyl alcohol",)), ("Anise alcohol", ("anise alcohol", "anisyl alcohol")),
          ("Farnesol", ("farnesol",)), ("Alpha-isomethyl ionone", ("alpha-isomethyl ionone",)),
          ("Methyl 2-octynoate", ("methyl 2-octynoate",)), ("Butylphenyl methylpropional", ("butylphenyl methylpropional", "lilial")),
          ("Benzyl alcohol", ("benzyl alcohol",)),
      )),
    Allergen("Essential oil", ("lavandula angustifolia oil", "lavender oil", "melaleuca alternifolia leaf oil", "tea tree oil",
                               "mentha piperita oil", "peppermint oil", "cananga odorata flower oil", "ylang ylang",
                               "citrus aurantium dulcis peel oil", "citrus limon peel oil", "rosmarinus officinalis leaf oil",
                               "eucalyptus globulus leaf oil", "pelargonium graveolens oil", "cinnamomum", "myroxylon pereirae"),
             "listed",
             "Essential oils carry the same fragrance allergens (linalool, limonene and others). “Natural” does not make them gentler.",
             "eu_2023_1545"),
    # Irritants: not allergies, but dose-dependent dryness and stinging on the skin barrier.
    Allergen("Sodium lauryl sulfate", ("sodium lauryl sulfate", "ammonium lauryl sulfate"), "irritant",
             "A strong cleanser used as the standard irritant in skin-barrier research. Fine rinsed off quickly; harsh if left on.",
             "tupker_sls"),
    Allergen("Cocamidopropyl betaine", ("cocamidopropyl betaine",), "irritant",
             "A mild cleanser; reactions usually trace back to manufacturing impurities.", "nacdg"),
    Allergen("Propylene glycol", ("propylene glycol",), "irritant",
             "Usually harmless; occasional irritation or allergy on damaged skin.", "nacdg"),
    Allergen("Lanolin", ("lanolin", "wool alcohol", "lanolin alcohol"), "irritant",
             "A rich emollient; an occasional allergen, mostly on eczema-prone or broken skin.", "nacdg"),
    # Photoallergens: react only with sunlight.
    Allergen("Oxybenzone", ("oxybenzone", "benzophenone-3"), "photo",
             "The most common sunscreen photoallergen in clinic patch tests.", "nacdg"),
)


# ─── UV filters ───────────────────────────────────────────────────────────────

FdaStatus = Literal["safe", "more_data", "not_safe", "not_approved"]


@dataclass(frozen=True, slots=True)
class UvFilter:
    name: str
    terms: tuple[str, ...]
    uvb: bool
    uva: Literal["none", "short", "long"]  # long = reaches UVA1 (340–400 nm)
    fda: FdaStatus
    note: str = ""
    source: str = "fda_sunscreen"
    stabiliser: bool = False


UV_FILTERS: tuple[UvFilter, ...] = (
    UvFilter("Zinc oxide", ("zinc oxide",), True, "long", "safe",
             "A mineral filter covering UVB and the full UVA range. One of two filters FDA proposes as safe and effective."),
    UvFilter("Titanium dioxide", ("titanium dioxide",), True, "short", "safe",
             "A mineral filter, strongest against UVB and short UVA. FDA proposes it as safe and effective."),
    UvFilter("Avobenzone", ("avobenzone", "butyl methoxydibenzoylmethane"), False, "long", "more_data",
             "The main US filter for long UVA; it breaks down in sunlight unless paired with a stabiliser.", "kockler_2012"),
    UvFilter("Bemotrizinol", ("bemotrizinol", "bis-ethylhexyloxyphenol methoxyphenyl triazine", "tinosorb s"), True, "long", "not_approved",
             "A photostable broad-spectrum filter used in Europe and Asia; not yet approved in the US.", stabiliser=True),
    UvFilter("Bisoctrizole", ("bisoctrizole", "methylene bis-benzotriazolyl tetramethylbutylphenol", "tinosorb m"), True, "long", "not_approved",
             "A photostable broad-spectrum filter used in Europe and Asia; not approved in the US."),
    UvFilter("Ecamsule", ("ecamsule", "terephthalylidene dicamphor sulfonic acid", "mexoryl sx"), False, "long", "more_data",
             "A photostable UVA filter."),
    UvFilter("Drometrizole trisiloxane", ("drometrizole trisiloxane", "mexoryl xl"), True, "long", "not_approved",
             "A photostable UVA and UVB filter used in Europe."),
    UvFilter("Diethylamino hydroxybenzoyl hexyl benzoate", ("diethylamino hydroxybenzoyl hexyl benzoate", "uvinul a plus"), False, "long", "not_approved",
             "A photostable long-UVA filter used in Europe."),
    UvFilter("Oxybenzone", ("oxybenzone", "benzophenone-3"), True, "short", "more_data",
             "Absorbed into the blood above FDA’s testing threshold and a known photoallergen. The EU caps it at 6 % (2.2 % in body products).",
             "eu_oxybenzone"),
    UvFilter("Octinoxate", ("octinoxate", "ethylhexyl methoxycinnamate"), True, "none", "more_data",
             "A UVB filter that also makes avobenzone less stable."),
    UvFilter("Octocrylene", ("octocrylene",), True, "none", "more_data",
             "A UVB filter that stabilises avobenzone.", stabiliser=True),
    UvFilter("Homosalate", ("homosalate",), True, "none", "more_data",
             "A UVB filter. The EU now allows it only in face products, up to 7.34 %.", "eu_homosalate"),
    UvFilter("Octisalate", ("octisalate", "ethylhexyl salicylate"), True, "none", "more_data", "A UVB filter."),
    UvFilter("Ensulizole", ("ensulizole", "phenylbenzimidazole sulfonic acid"), True, "none", "more_data", "A water-soluble UVB filter."),
    UvFilter("Ethylhexyl triazone", ("ethylhexyl triazone", "uvinul t 150"), True, "none", "not_approved", "A photostable UVB filter used in Europe."),
    UvFilter("Polysilicone-15", ("polysilicone-15", "parsol slx"), True, "none", "not_approved", "A UVB filter used in Europe."),
    UvFilter("Meradimate", ("meradimate", "menthyl anthranilate"), False, "short", "more_data", "A weak short-UVA filter."),
    UvFilter("Sulisobenzone", ("sulisobenzone", "benzophenone-4"), True, "short", "more_data", "A benzophenone filter."),
    UvFilter("PABA", ("aminobenzoic acid", "paba"), True, "none", "not_safe",
             "FDA proposes it is not safe and effective; frequent allergy."),
    UvFilter("Trolamine salicylate", ("trolamine salicylate",), True, "none", "not_safe",
             "FDA proposes it is not safe and effective as a sunscreen."),
)

# Not filters themselves, but they keep avobenzone from breaking down.
AVOBENZONE_STABILISERS: tuple[str, ...] = (
    "ethylhexyl methoxycrylate", "methoxycrylene", "polyester-8", "diethylhexyl syringylidenemalonate",
    "diethylhexyl 2,6-naphthalate", "diethylhexyl naphthalate",
)


# ─── Actives ──────────────────────────────────────────────────────────────────

Strength = Literal["strong", "moderate", "limited", "little"]


@dataclass(frozen=True, slots=True)
class Active:
    name: str
    terms: tuple[str, ...]
    does: str                     # what people buy it for, in their words
    strength: Strength
    reality: str                  # what the trials actually show
    source: str
    studied: str | None = None    # the strengths trials used, as written on the card
    above_one_percent: bool = False  # trials used more than 1 %: a place below the 1 % line matters
    pregnancy: str | None = None
    sun_sensitising: bool = False
    top_only: int | None = None   # only counts within the first N label positions


ACTIVES: tuple[Active, ...] = (
    Active("Tretinoin", ("tretinoin", "retinoic acid"), "Fine lines, acne", "strong",
           "The best-studied anti-aging ingredient: it measurably reduces fine lines and treats acne. Prescription-only in most countries.",
           "mukherjee_2006", "0.025–0.1 %",
           pregnancy="Topical retinoids are usually stopped during pregnancy.", sun_sensitising=True),
    Active("Retinal", ("retinal", "retinaldehyde"), "Fine lines", "moderate",
           "Converts to retinoic acid in the skin in one step; smaller trials show anti-aging effects.",
           "mukherjee_2006", "0.05–0.1 %",
           pregnancy="Topical retinoids are usually stopped during pregnancy.", sun_sensitising=True),
    Active("Retinol", ("retinol",), "Fine lines, texture", "moderate",
           "Converts to retinoic acid in the skin. Trials show smoother skin and fewer fine lines over 3–6 months, more slowly than prescription tretinoin.",
           "kong_2016", "0.1–1 %",
           pregnancy="Topical retinoids are usually stopped during pregnancy.", sun_sensitising=True),
    Active("Retinyl esters", ("retinyl palmitate", "retinyl acetate", "retinyl propionate"), "Fine lines", "limited",
           "Needs several conversion steps in the skin; little trial evidence of visible change on its own.",
           "mukherjee_2006",
           pregnancy="Topical retinoids are usually stopped during pregnancy."),
    Active("Bakuchiol", ("bakuchiol",), "Retinol alternative", "limited",
           "One 12-week trial of 44 people found it comparable to 0.5 % retinol, with less irritation. Promising, not yet replicated widely.",
           "dhaliwal_2019", "0.5 %"),
    Active("Niacinamide", ("niacinamide", "nicotinamide"), "Redness, pores, barrier", "moderate",
           "Controlled trials at 2–5 % show better barrier function, less redness and blotchiness, and some improvement in fine lines.",
           "bissett_2005", "2–5 %", above_one_percent=True),
    Active("Vitamin C", ("ascorbic acid", "l-ascorbic acid"), "Brightening, antioxidant", "moderate",
           "Pure L-ascorbic acid absorbs into skin at 10–20 % and low pH. Small trials show brighter, firmer skin.",
           "pinnell_2001", "10–20 %", above_one_percent=True),
    Active("Vitamin C derivative", ("ascorbyl glucoside", "magnesium ascorbyl phosphate", "sodium ascorbyl phosphate",
                                    "ascorbyl tetraisopalmitate", "tetrahexyldecyl ascorbate", "3-o-ethyl ascorbic acid",
                                    "ethyl ascorbic acid"), "Brightening", "limited",
           "More stable than pure vitamin C, but far less tested in people.", "pinnell_2001"),
    Active("Azelaic acid", ("azelaic acid",), "Acne, redness, dark spots", "strong",
           "Tested in many trials for acne and rosacea at 15–20 % (prescription strength).",
           "azelaic", "15–20 %", above_one_percent=True),
    Active("Salicylic acid", ("salicylic acid", "beta hydroxy acid"), "Acne, clogged pores", "strong",
           "An FDA-recognised acne treatment at 0.5–2 %. It dissolves oil in the pore.",
           "fda_acne", "0.5–2 %",
           pregnancy="Fine in a cleanser or spot treatment; large-area peels are usually avoided in pregnancy."),
    Active("Benzoyl peroxide", ("benzoyl peroxide",), "Acne", "strong",
           "An FDA-recognised acne treatment at 2.5–10 %; kills acne bacteria. Can bleach fabric.",
           "fda_acne", "2.5–10 %", above_one_percent=True),
    Active("Glycolic acid", ("glycolic acid",), "Exfoliation, texture", "moderate",
           "An alpha hydroxy acid that loosens dead skin. Makes skin more sun-sensitive for about a week after use.",
           "fda_aha", "5–10 %", above_one_percent=True, sun_sensitising=True),
    Active("Lactic acid", ("lactic acid",), "Exfoliation, hydration", "moderate",
           "A gentler alpha hydroxy acid. Makes skin more sun-sensitive.",
           "fda_aha", "5–12 %", above_one_percent=True, sun_sensitising=True, top_only=12),
    Active("Mandelic acid", ("mandelic acid",), "Gentle exfoliation", "limited",
           "A larger alpha hydroxy acid; small studies only.", "fda_aha", sun_sensitising=True),
    Active("Tranexamic acid", ("tranexamic acid",), "Dark spots, melasma", "limited",
           "Several small trials in melasma, mostly as pills or injections; topical evidence is thinner.",
           "tranexamic", "2–5 %", above_one_percent=True),
    Active("Glycerin", ("glycerin", "glycerol"), "Hydration", "strong",
           "One of the best-studied moisturisers: it draws water into the skin and supports the barrier.",
           "fluhr_2008", top_only=5),
    Active("Urea", ("urea",), "Dry, rough skin", "strong",
           "Well tested for very dry skin and eczema: hydrating at 5–10 %, exfoliating above 10 %.",
           "pan_2013", "5–10 %", above_one_percent=True),
    Active("Ceramides", ("ceramide np", "ceramide ap", "ceramide eop", "ceramide ns", "ceramide eos", "ceramide 3",
                         "ceramide 6 ii", "ceramide 1", "ceramides"), "Barrier repair", "moderate",
           "Ceramide-rich creams helped in trials for eczema-prone skin, as part of a lipid mix.", "chamlin_2002"),
    Active("Panthenol", ("panthenol", "dexpanthenol", "d-panthenol"), "Soothing, barrier", "moderate",
           "Trials show better hydration and faster barrier repair at around 5 %.", "proksch_2017", "1–5 %"),
    Active("Hyaluronic acid", ("hyaluronic acid", "sodium hyaluronate", "hydrolyzed hyaluronic acid",
                               "sodium acetylated hyaluronate"), "Plumping, hydration", "limited",
           "Hydrates the surface at low strength. It does not refill wrinkles from a cream; injected fillers are a different thing.",
           "pavicic_2011", "0.1 %"),
    Active("Peptides", ("palmitoyl pentapeptide-4", "palmitoyl tripeptide-1", "palmitoyl tetrapeptide-7",
                        "acetyl hexapeptide-8", "acetyl hexapeptide-3", "copper tripeptide-1", "palmitoyl tripeptide-5",
                        "matrixyl", "argireline"), "Firming, wrinkles", "limited",
           "A few small, mostly maker-funded trials. Promising in the lab, unproven at scale.", "robinson_2005"),
    Active("Collagen", ("collagen", "hydrolyzed collagen", "soluble collagen"), "Firming", "little",
           "Too large to pass through the skin, so it cannot add to your own collagen. It works as a surface moisturiser.",
           "bos_2000"),
    Active("Centella asiatica", ("centella asiatica", "madecassoside", "asiaticoside", "cica"), "Soothing", "limited",
           "Lab and small human studies suggest soothing and wound-healing effects.", "centella"),
    Active("Snail mucin", ("snail secretion filtrate", "snail mucin"), "Repair, glow", "little",
           "Very few human studies; benefits are mostly reported by users.", "centella"),
    Active("Hydroquinone", ("hydroquinone",), "Dark spots", "strong",
           "Effective for dark spots, but banned in EU cosmetics and prescription-only in the US since 2020.",
           "eu_1223", "2–4 %", above_one_percent=True,
           pregnancy="Hydroquinone is absorbed more than most skin ingredients; usually avoided in pregnancy."),
)


# ─── Label landmarks and good-to-know ─────────────────────────────────────────

# Legal caps of 1 % or less. Everything listed after one of these is at 1 % or less
# too: ingredients above 1 % must come first, in descending order (EU Art. 19, US 701.3).
ONE_PERCENT_MARKERS: dict[str, str] = {
    "phenoxyethanol": "1 %", "methylparaben": "0.4 %", "ethylparaben": "0.4 %", "propylparaben": "0.14 %",
    "butylparaben": "0.14 %", "chlorphenesin": "0.3 %", "potassium sorbate": "0.6 %", "sorbic acid": "0.6 %",
    "dehydroacetic acid": "0.6 %", "sodium dehydroacetate": "0.6 %", "dmdm hydantoin": "0.6 %",
    "imidazolidinyl urea": "0.6 %", "diazolidinyl urea": "0.5 %", "methylisothiazolinone": "0.0015 %",
    "methylchloroisothiazolinone": "0.0015 %", "iodopropynyl butylcarbamate": "0.02 %", "triclosan": "0.3 %",
    "chlorhexidine digluconate": "0.3 %", "climbazole": "0.5 %",
}

RINSE_OFF_WORDS = (
    "shampoo", "cleanser", "cleansing", "face wash", "body wash", "wash", "shower", "bath", "soap", "scrub",
    "rinse", "toothpaste", "mouthwash", "conditioner", "micellar",
)
LEAVE_ON_WORDS = ("leave-in", "leave in", "no-rinse", "no rinse", "dry shampoo")

PARABENS = ("methylparaben", "ethylparaben", "propylparaben", "butylparaben")
BANNED_PARABENS = ("isopropylparaben", "isobutylparaben", "phenylparaben", "benzylparaben", "pentylparaben")
SILICONES = ("dimethicone", "cyclopentasiloxane", "cyclohexasiloxane", "cyclotetrasiloxane", "methicone",
             "amodimethicone", "dimethiconol", "siloxane")
D4_D5 = ("cyclotetrasiloxane", "cyclopentasiloxane")
DRYING_ALCOHOLS = ("alcohol denat", "alcohol", "sd alcohol", "isopropyl alcohol", "ethanol")
SULFATES = ("sodium lauryl sulfate", "sodium laureth sulfate", "ammonium lauryl sulfate", "ammonium laureth sulfate",
            "sodium coco-sulfate", "sodium coco sulfate")


# ─── What each ingredient is for (CosIng function vocabulary) ─────────────────

ROLES: dict[str, str] = {
    "water": "Solvent", "aqua": "Solvent", "eau": "Solvent",
    "glycerin": "Humectant", "butylene glycol": "Humectant", "propanediol": "Humectant", "pentylene glycol": "Humectant",
    "propylene glycol": "Humectant", "sorbitol": "Humectant", "sodium pca": "Humectant", "betaine": "Humectant",
    "hyaluronic acid": "Humectant", "sodium hyaluronate": "Humectant", "urea": "Humectant", "panthenol": "Skin conditioning",
    "allantoin": "Soothing", "bisabolol": "Soothing", "dipotassium glycyrrhizate": "Soothing",
    "squalane": "Emollient", "caprylic/capric triglyceride": "Emollient", "isopropyl myristate": "Emollient",
    "isopropyl palmitate": "Emollient", "ethylhexyl palmitate": "Emollient", "ethylhexyl stearate": "Emollient",
    "c12-15 alkyl benzoate": "Emollient", "coco-caprylate/caprate": "Emollient", "isononyl isononanoate": "Emollient",
    "shea butter": "Emollient", "butyrospermum parkii butter": "Emollient", "jojoba esters": "Emollient",
    "hydrolyzed jojoba esters": "Emollient", "simmondsia chinensis seed oil": "Emollient", "mineral oil": "Occlusive",
    "paraffinum liquidum": "Occlusive", "petrolatum": "Occlusive", "beeswax": "Occlusive", "cera alba": "Occlusive",
    "cetyl alcohol": "Fatty alcohol (non-drying)", "cetearyl alcohol": "Fatty alcohol (non-drying)",
    "stearyl alcohol": "Fatty alcohol (non-drying)", "behenyl alcohol": "Fatty alcohol (non-drying)",
    "glyceryl stearate": "Emulsifier", "glyceryl stearate se": "Emulsifier", "potassium cetyl phosphate": "Emulsifier",
    "polysorbate 20": "Emulsifier", "polysorbate 60": "Emulsifier", "polysorbate 80": "Emulsifier",
    "cetearyl glucoside": "Emulsifier", "sorbitan olivate": "Emulsifier", "cetearyl olivate": "Emulsifier",
    "lecithin": "Emulsifier", "xanthan gum": "Thickener", "carbomer": "Thickener", "sodium polyacrylate": "Thickener",
    "hydroxyethylcellulose": "Thickener", "acrylates/c10-30 alkyl acrylate crosspolymer": "Thickener",
    "silica": "Absorbent", "aluminum starch octenylsuccinate": "Absorbent", "tapioca starch": "Absorbent",
    "disodium edta": "Chelating agent", "tetrasodium edta": "Chelating agent", "sodium phytate": "Chelating agent",
    "trisodium ethylenediamine disuccinate": "Chelating agent",
    "citric acid": "pH adjuster", "sodium hydroxide": "pH adjuster", "triethanolamine": "pH adjuster",
    "sodium citrate": "pH adjuster", "tromethamine": "pH adjuster", "aminomethyl propanol": "pH adjuster",
    "tocopherol": "Antioxidant", "tocopheryl acetate": "Antioxidant", "bht": "Antioxidant",
    "ascorbyl palmitate": "Antioxidant", "ferulic acid": "Antioxidant",
    "phenoxyethanol": "Preservative", "ethylhexylglycerin": "Preservative booster", "caprylyl glycol": "Preservative booster",
    "1,2-hexanediol": "Preservative booster", "chlorphenesin": "Preservative", "sodium benzoate": "Preservative",
    "potassium sorbate": "Preservative", "benzyl alcohol": "Preservative", "dehydroacetic acid": "Preservative",
    "sodium dehydroacetate": "Preservative",
    "sodium laureth sulfate": "Cleanser", "sodium lauryl sulfate": "Cleanser", "cocamidopropyl betaine": "Cleanser",
    "decyl glucoside": "Cleanser", "coco-glucoside": "Cleanser", "lauryl glucoside": "Cleanser",
    "sodium cocoyl isethionate": "Cleanser", "disodium laureth sulfosuccinate": "Cleanser",
    "sodium methyl cocoyl taurate": "Cleanser", "sodium lauroyl sarcosinate": "Cleanser",
    "polyquaternium-10": "Conditioning", "guar hydroxypropyltrimonium chloride": "Conditioning",
    "behentrimonium chloride": "Conditioning", "cetrimonium chloride": "Conditioning",
    "mica": "Colour / shimmer", "iron oxides": "Colour", "talc": "Absorbent",
    "alcohol denat": "Solvent (drying)", "alcohol": "Solvent (drying)", "fragrance": "Fragrance", "parfum": "Fragrance",
    "sodium chloride": "Thickener", "dimethicone": "Silicone (smoothing)", "cyclopentasiloxane": "Silicone (volatile)",
}

# Suffix and prefix patterns for the many ingredients that share a family.
ROLE_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\bci \d{5}\b", "Colour"),
    (r"(dimethicone|methicone|siloxane|silsesquioxane)", "Silicone (smoothing)"),
    (r"\bpeg-\d+", "Emulsifier"),
    (r"(ceteth|steareth|laureth|trideceth|oleth)-\d+", "Emulsifier"),
    (r"copolymer|crosspolymer", "Film former / texture"),
    (r"paraben$", "Preservative"),
    (r"\b(extract|leaf water|flower water)\b", "Plant extract"),
    (r"\b(seed|kernel|fruit|nut) oil\b", "Plant oil (emollient)"),
    (r"\bceramide\b", "Barrier lipid"),
    (r"\bpeptide|\bpeptide-\d", "Peptide"),
    (r"\b(glucoside|betaine|isethionate|sulfate|sulfosuccinate|sarcosinate|taurate)$", "Cleanser"),
    (r"\b(stearate|palmitate|myristate|benzoate|caprylate|isononanoate|adipate)$", "Emollient"),
    (r"(trimonium|quaternium)", "Conditioning"),
    (r"\bgum\b", "Thickener"),
)
