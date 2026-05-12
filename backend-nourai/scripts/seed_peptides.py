"""Seed 20 curated peptide rows into the ingredients table.

Run from the project root:
    python3 backend-nourai/scripts/seed_peptides.py

After seeding, run the research agent to populate evidence:
    python3 backend-nourai/scripts/research_agent.py --category peptide
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.ingredient import Ingredient, IngredientCategory, ResearchStatus

PEPTIDES = [
    {
        "canonical_name": "BPC-157",
        "description": "Body Protection Compound-157 is a synthetic peptide derived from a protective protein found in gastric juice.",
        "synonyms": ["Body Protection Compound", "BPC157"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous", "oral"],
        "admin_route_notes": "Subcutaneous injection is the most studied route for systemic effects. Oral administration shows activity in gastrointestinal models but poor systemic bioavailability.",
        "cycle_length_weeks": 12,
        "washout_weeks": 4,
        "cycling_notes": "Standard practice is to cycle to avoid receptor desensitisation. Long-term continuous use has not been studied in humans.",
    },
    {
        "canonical_name": "TB-500 (Thymosin Beta-4)",
        "description": "A synthetic fragment of the naturally occurring protein Thymosin Beta-4, involved in actin regulation and tissue repair.",
        "synonyms": ["Thymosin Beta-4", "TB500"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "prohibited_all",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Administered subcutaneously. Intramuscular is used in veterinary contexts.",
        "cycle_length_weeks": 8,
        "washout_weeks": 4,
        "cycling_notes": "Typically cycled 8–12 weeks on, 4 weeks off based on animal and anecdotal data.",
    },
    {
        "canonical_name": "GHK-Cu",
        "description": "Copper peptide complex (glycyl-L-histidyl-L-lysine-Cu²⁺) naturally found in human plasma. Known for skin remodelling and wound healing activity.",
        "synonyms": ["Copper peptide", "GHK-copper", "glycyl-L-histidyl-L-lysine"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous", "topical"],
        "admin_route_notes": "Topical is the most common route for cosmetic applications. Subcutaneous used in research settings.",
        "cycle_length_weeks": None,
        "washout_weeks": None,
        "cycling_notes": "Topical use is generally continuous. No established cycling protocol for injectable use.",
    },
    {
        "canonical_name": "Epitalon",
        "description": "Tetrapeptide (Ala-Glu-Asp-Gly) based on epithalamin, a natural polypeptide produced by the pineal gland. Studied for telomerase activation.",
        "synonyms": ["Epithalon", "Epithalone"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Administered subcutaneously. Intranasal used in some protocols.",
        "cycle_length_weeks": 3,
        "washout_weeks": 24,
        "cycling_notes": "Typically run in short 10-day to 3-week courses, 1–2 times per year, based on Russian research protocols.",
    },
    {
        "canonical_name": "Selank",
        "description": "Synthetic analogue of the immunomodulatory peptide tuftsin. Studied for anxiolytic and nootropic effects.",
        "synonyms": ["TP-7"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["intranasal"],
        "admin_route_notes": "Intranasal is the standard route, providing rapid CNS delivery. Licensed as nasal drops in Russia.",
        "cycle_length_weeks": 4,
        "washout_weeks": 2,
        "cycling_notes": "Used in 2–4 week courses in Russian clinical practice, with breaks to assess response.",
    },
    {
        "canonical_name": "Semax",
        "description": "Synthetic analogue of ACTH(4-7) with neuroprotective and nootropic properties. Used clinically in Russia.",
        "synonyms": [],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["intranasal"],
        "admin_route_notes": "Administered intranasally. Rapid CNS uptake via olfactory pathway.",
        "cycle_length_weeks": 4,
        "washout_weeks": 2,
        "cycling_notes": "Cycled in 2–4 week courses based on Russian clinical data.",
    },
    {
        "canonical_name": "Thymosin Alpha-1",
        "description": "Naturally occurring thymic peptide with immunomodulatory activity. FDA-approved (Zadaxin) in some countries for hepatitis and immune deficiency.",
        "synonyms": ["Tα1", "Thymalfasin", "Zadaxin"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection is the established route used in all clinical trials.",
        "cycle_length_weeks": 12,
        "washout_weeks": 4,
        "cycling_notes": "Dosing protocols vary widely by indication. Self-administration protocols typically run 8–12 weeks.",
    },
    {
        "canonical_name": "CJC-1295",
        "description": "Synthetic analogue of growth hormone-releasing hormone (GHRH). Extends GH pulse duration.",
        "synonyms": ["CJC1295", "DAC:GRF"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "prohibited_all",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection. Often combined with a GHRP.",
        "cycle_length_weeks": 12,
        "washout_weeks": 4,
        "cycling_notes": "Standard cycle 8–16 weeks. Longer periods risk pituitary receptor downregulation.",
    },
    {
        "canonical_name": "Ipamorelin",
        "description": "Selective growth hormone secretagogue (GHS). Among the most selective GHRP peptides with minimal cortisol or prolactin elevation.",
        "synonyms": [],
        "us_regulatory_status": "research_chemical",
        "wada_status": "prohibited_all",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection, typically 2–3× daily due to short half-life (~2h).",
        "cycle_length_weeks": 12,
        "washout_weeks": 4,
        "cycling_notes": "Cycle 8–16 weeks with off periods to maintain receptor sensitivity.",
    },
    {
        "canonical_name": "GHRP-2",
        "description": "Second-generation growth hormone releasing peptide. More potent GH release than GHRP-6 with less ghrelin-mediated hunger.",
        "synonyms": ["Growth Hormone Releasing Peptide-2", "Pralmorelin"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "prohibited_all",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection. Short half-life requires multiple daily dosing.",
        "cycle_length_weeks": 12,
        "washout_weeks": 4,
        "cycling_notes": "Cycle 8–16 weeks.",
    },
    {
        "canonical_name": "GHRP-6",
        "description": "First-generation growth hormone releasing peptide. Potent GH secretagogue; known to significantly stimulate appetite via ghrelin pathways.",
        "synonyms": ["Growth Hormone Releasing Peptide-6"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "prohibited_all",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection. Administer fasted for maximum GH pulse.",
        "cycle_length_weeks": 12,
        "washout_weeks": 4,
        "cycling_notes": "Cycle 8–16 weeks.",
    },
    {
        "canonical_name": "Hexarelin",
        "description": "Potent synthetic growth hormone secretagogue. Most potent GHRP; also has cardioprotective properties independent of GH release.",
        "synonyms": ["Examorelin"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "prohibited_all",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection. Desensitises faster than other GHRPs, limiting cycle length.",
        "cycle_length_weeks": 4,
        "washout_weeks": 4,
        "cycling_notes": "Shorter cycles (4 weeks) recommended due to rapid receptor desensitisation.",
    },
    {
        "canonical_name": "AOD-9604",
        "description": "C-terminal fragment of human growth hormone (hGH176-191). Studied for fat metabolism without the growth-promoting effects of full hGH.",
        "synonyms": ["Advanced Obesity Drug 9604", "hGH 176-191"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous", "oral"],
        "admin_route_notes": "Subcutaneous is more studied. Oral form was tested in clinical trials (Metabolicon) with limited efficacy.",
        "cycle_length_weeks": 12,
        "washout_weeks": 4,
        "cycling_notes": "Typical protocol 8–12 weeks. Limited long-term human data.",
    },
    {
        "canonical_name": "PT-141 (Bremelanotide)",
        "description": "Melanocortin receptor agonist approved by the FDA (Vyleesi) for hypoactive sexual desire disorder (HSDD) in premenopausal women.",
        "synonyms": ["Bremelanotide", "Vyleesi", "PT141"],
        "us_regulatory_status": "fda_approved",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous", "intranasal"],
        "admin_route_notes": "FDA-approved as subcutaneous auto-injector (Vyleesi). Earlier intranasal formulations showed blood pressure concerns and are not approved.",
        "cycle_length_weeks": None,
        "washout_weeks": None,
        "cycling_notes": "As-needed dosing per FDA approval. No cycling protocol — use no more than once per 24 hours.",
    },
    {
        "canonical_name": "Melanotan II",
        "description": "Synthetic analogue of alpha-MSH (alpha-melanocyte-stimulating hormone). Studied for tanning, sexual function, and appetite suppression.",
        "synonyms": ["MTII", "MT-2"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection. Intranasal nasal sprays are sold online but are not pharmaceutical grade.",
        "cycle_length_weeks": 8,
        "washout_weeks": 8,
        "cycling_notes": "Cycle to avoid receptor overstimulation and monitor for nausea and mole changes.",
    },
    {
        "canonical_name": "SS-31 (Elamipretide)",
        "description": "Mitochondria-targeting tetrapeptide that binds cardiolipin in the inner mitochondrial membrane. In Phase III trials for mitochondrial myopathy.",
        "synonyms": ["Elamipretide", "MTP-131", "Bendavia"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection used in all clinical trials. No oral bioavailability.",
        "cycle_length_weeks": None,
        "washout_weeks": None,
        "cycling_notes": "No established cycling protocol. Trial data uses continuous daily administration.",
    },
    {
        "canonical_name": "Humanin",
        "description": "Endogenous mitochondria-derived peptide with cytoprotective and anti-apoptotic activity. Levels decline with age.",
        "synonyms": ["HN"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection used in animal and early human studies.",
        "cycle_length_weeks": None,
        "washout_weeks": None,
        "cycling_notes": "No established human cycling protocol.",
    },
    {
        "canonical_name": "MOTS-c",
        "description": "Mitochondria-derived peptide encoded in the mitochondrial 12S rRNA. Regulates metabolic homeostasis and exercise adaptations.",
        "synonyms": ["Mitochondrial Open Reading Frame of the 12S rRNA-c"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection in all research studies.",
        "cycle_length_weeks": None,
        "washout_weeks": None,
        "cycling_notes": "No established human cycling protocol. Early-stage research.",
    },
    {
        "canonical_name": "KPV",
        "description": "C-terminal tripeptide fragment of alpha-MSH (Lys-Pro-Val). Anti-inflammatory properties studied in IBD models.",
        "synonyms": ["Lys-Pro-Val"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["oral", "topical"],
        "admin_route_notes": "Oral for gut-targeted delivery; topical for dermatological applications. Resistant to gastric acid — preserves activity orally.",
        "cycle_length_weeks": None,
        "washout_weeks": None,
        "cycling_notes": "No established cycling protocol. Mostly preclinical data.",
    },
    {
        "canonical_name": "Semaglutide",
        "description": "GLP-1 receptor agonist approved by the FDA for type 2 diabetes (Ozempic) and chronic weight management (Wegovy).",
        "synonyms": ["Ozempic", "Wegovy", "Rybelsus"],
        "us_regulatory_status": "fda_approved",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous", "oral"],
        "admin_route_notes": "Weekly subcutaneous injection (Ozempic/Wegovy). Daily oral tablet (Rybelsus) for diabetes only — taken fasted with a small amount of water.",
        "cycle_length_weeks": None,
        "washout_weeks": None,
        "cycling_notes": "Long-term continuous use as prescribed. Discontinuation leads to weight regain within weeks.",
    },
]


async def seed() -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        inserted = 0
        skipped = 0
        for data in PEPTIDES:
            existing = await db.execute(
                select(Ingredient).where(Ingredient.canonical_name == data["canonical_name"])
            )
            if existing.scalar_one_or_none() is not None:
                skipped += 1
                continue

            ingredient = Ingredient(
                category=IngredientCategory.PEPTIDE,
                research_status=ResearchStatus.PENDING,
                side_effects=[],
                contraindications=[],
                drug_interactions=[],
                **data,
            )
            db.add(ingredient)
            inserted += 1

        await db.commit()
        print(f"Seeded {inserted} peptides ({skipped} already existed).")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
