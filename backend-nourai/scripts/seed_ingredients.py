"""Seed script for curated ingredients database."""

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.models.ingredient import Ingredient

settings = get_settings()

# Priority ingredients for MVP
SEED_INGREDIENTS = [
    # Supplements
    {
        "canonical_name": "Creatine Monohydrate",
        "synonyms": ["creatine", "creatine mono"],
        "category": "supplement",
        "description": "A naturally occurring compound that helps supply energy to muscles.",
        "mechanism_summary": "Increases phosphocreatine stores in muscles, enabling faster ATP regeneration during high-intensity exercise.",
        "typical_dose_range": "3-5g daily",
        "side_effects": ["Water retention", "Digestive discomfort at high doses"],
        "contraindications": ["Kidney disease"],
    },
    {
        "canonical_name": "Whey Protein",
        "synonyms": ["whey", "whey isolate", "whey concentrate", "whey protein isolate"],
        "category": "supplement",
        "description": "A complete protein derived from milk, rich in essential amino acids.",
        "mechanism_summary": "Provides essential amino acids, particularly leucine, which activates mTOR pathway for muscle protein synthesis.",
        "typical_dose_range": "20-40g per serving",
        "side_effects": ["Bloating", "Gas if lactose intolerant"],
        "contraindications": ["Milk allergy", "Lactose intolerance (for concentrate)"],
    },
    {
        "canonical_name": "Vitamin D3",
        "synonyms": ["vitamin d", "cholecalciferol", "d3"],
        "category": "supplement",
        "description": "Fat-soluble vitamin essential for calcium absorption and immune function.",
        "mechanism_summary": "Binds to vitamin D receptors affecting gene expression for calcium metabolism, immune response, and cell growth.",
        "typical_dose_range": "1000-5000 IU daily",
        "side_effects": ["Hypercalcemia at very high doses"],
        "contraindications": ["Hypercalcemia", "Kidney stones"],
    },
    {
        "canonical_name": "Magnesium",
        "synonyms": ["magnesium glycinate", "magnesium citrate", "magnesium oxide", "mag"],
        "category": "supplement",
        "description": "Essential mineral involved in over 300 enzymatic reactions.",
        "mechanism_summary": "Cofactor for ATP production, muscle and nerve function, and protein synthesis.",
        "typical_dose_range": "200-400mg daily",
        "side_effects": ["Loose stools (especially oxide form)"],
        "contraindications": ["Kidney disease", "Heart block"],
    },
    {
        "canonical_name": "Omega-3 Fatty Acids",
        "synonyms": ["fish oil", "omega 3", "EPA", "DHA", "omega-3"],
        "category": "supplement",
        "description": "Essential polyunsaturated fats with anti-inflammatory properties.",
        "mechanism_summary": "Incorporated into cell membranes, modulates inflammatory pathways, supports brain and cardiovascular health.",
        "typical_dose_range": "1-3g EPA+DHA daily",
        "side_effects": ["Fishy burps", "Blood thinning at high doses"],
        "contraindications": ["Blood thinners", "Scheduled surgery"],
    },
    {
        "canonical_name": "Caffeine",
        "synonyms": ["coffee", "caffeine anhydrous"],
        "category": "supplement",
        "description": "Central nervous system stimulant that increases alertness and energy.",
        "mechanism_summary": "Blocks adenosine receptors, preventing drowsiness and increasing dopamine signaling.",
        "typical_dose_range": "50-400mg daily",
        "side_effects": ["Insomnia", "Anxiety", "Increased heart rate", "Dependency"],
        "contraindications": ["Anxiety disorders", "Heart arrhythmias", "Pregnancy (high doses)"],
    },
    {
        "canonical_name": "Ashwagandha",
        "synonyms": ["withania somnifera", "KSM-66", "sensoril"],
        "category": "supplement",
        "description": "Adaptogenic herb used to reduce stress and improve resilience.",
        "mechanism_summary": "Modulates cortisol levels and GABA receptors, reducing stress response and promoting calm.",
        "typical_dose_range": "300-600mg daily",
        "side_effects": ["Drowsiness", "Upset stomach"],
        "contraindications": ["Thyroid disorders", "Pregnancy", "Autoimmune conditions"],
    },
    {
        "canonical_name": "Melatonin",
        "synonyms": ["melatonin"],
        "category": "supplement",
        "description": "Hormone that regulates sleep-wake cycles.",
        "mechanism_summary": "Binds to melatonin receptors in the brain, signaling the body to prepare for sleep.",
        "typical_dose_range": "0.5-5mg before bed",
        "side_effects": ["Grogginess", "Vivid dreams"],
        "contraindications": ["Autoimmune conditions", "Depression"],
    },
    {
        "canonical_name": "Probiotics",
        "synonyms": ["lactobacillus", "bifidobacterium", "probiotic blend"],
        "category": "supplement",
        "description": "Live beneficial bacteria that support gut microbiome health.",
        "mechanism_summary": "Colonize the gut, compete with harmful bacteria, and produce beneficial metabolites.",
        "typical_dose_range": "1-50 billion CFU daily",
        "side_effects": ["Temporary bloating", "Gas"],
        "contraindications": ["Severe immunocompromise"],
    },
    {
        "canonical_name": "Collagen",
        "synonyms": ["collagen peptides", "hydrolyzed collagen", "collagen protein"],
        "category": "supplement",
        "description": "Structural protein supporting skin, joints, and connective tissue.",
        "mechanism_summary": "Provides amino acids (glycine, proline) as building blocks for collagen synthesis.",
        "typical_dose_range": "10-20g daily",
        "side_effects": ["Rare digestive discomfort"],
        "contraindications": [],
    },
    # Food additives to watch
    {
        "canonical_name": "Carrageenan",
        "synonyms": ["carrageenan", "E407"],
        "category": "additive",
        "description": "Seaweed-derived thickener and stabilizer used in food products.",
        "mechanism_summary": "May trigger inflammation in some individuals by affecting gut barrier function.",
        "typical_dose_range": "N/A - food additive",
        "side_effects": ["Digestive issues in sensitive individuals"],
        "contraindications": ["IBD", "IBS"],
    },
    {
        "canonical_name": "Aspartame",
        "synonyms": ["aspartame", "E951", "NutraSweet", "Equal"],
        "category": "additive",
        "description": "Artificial sweetener approximately 200 times sweeter than sugar.",
        "mechanism_summary": "Metabolized to aspartic acid, phenylalanine, and methanol. May affect gut microbiome.",
        "typical_dose_range": "ADI: 40mg/kg body weight",
        "side_effects": ["Headaches in some individuals"],
        "contraindications": ["Phenylketonuria (PKU)"],
    },
    {
        "canonical_name": "Sucralose",
        "synonyms": ["sucralose", "Splenda", "E955"],
        "category": "additive",
        "description": "Zero-calorie artificial sweetener derived from sugar.",
        "mechanism_summary": "Not metabolized by the body but may affect gut bacteria composition.",
        "typical_dose_range": "ADI: 5mg/kg body weight",
        "side_effects": ["May affect gut microbiome"],
        "contraindications": [],
    },
    {
        "canonical_name": "MSG",
        "synonyms": ["monosodium glutamate", "E621", "glutamate"],
        "category": "additive",
        "description": "Flavor enhancer that adds umami taste to foods.",
        "mechanism_summary": "Activates glutamate receptors on the tongue. Generally recognized as safe.",
        "typical_dose_range": "N/A - flavor enhancer",
        "side_effects": ["Headache in sensitive individuals (rare)"],
        "contraindications": [],
    },
    # Skincare ingredients
    {
        "canonical_name": "Niacinamide",
        "synonyms": ["vitamin B3", "nicotinamide"],
        "category": "skincare",
        "description": "Form of vitamin B3 with multiple skin benefits.",
        "mechanism_summary": "Supports skin barrier by increasing ceramide production, reduces inflammation via NF-kB pathway.",
        "typical_dose_range": "2-5% concentration",
        "side_effects": ["Mild flushing at high concentrations"],
        "contraindications": [],
    },
    {
        "canonical_name": "Retinol",
        "synonyms": ["vitamin A", "retinoid", "retinal", "retinoic acid"],
        "category": "skincare",
        "description": "Vitamin A derivative that promotes cell turnover and collagen production.",
        "mechanism_summary": "Binds to retinoid receptors, increasing cell turnover and stimulating collagen synthesis.",
        "typical_dose_range": "0.25-1% concentration",
        "side_effects": ["Dryness", "Peeling", "Sun sensitivity"],
        "contraindications": ["Pregnancy", "Breastfeeding"],
    },
    {
        "canonical_name": "Hyaluronic Acid",
        "synonyms": ["HA", "sodium hyaluronate", "hyaluronan"],
        "category": "skincare",
        "description": "Naturally occurring molecule that holds up to 1000x its weight in water.",
        "mechanism_summary": "Draws water into the skin, providing hydration and plumping effect.",
        "typical_dose_range": "0.1-2% concentration",
        "side_effects": [],
        "contraindications": [],
    },
    {
        "canonical_name": "Salicylic Acid",
        "synonyms": ["BHA", "beta hydroxy acid"],
        "category": "skincare",
        "description": "Oil-soluble acid that exfoliates and unclogs pores.",
        "mechanism_summary": "Penetrates oil glands to dissolve sebum and dead skin cells inside pores.",
        "typical_dose_range": "0.5-2% concentration",
        "side_effects": ["Dryness", "Irritation"],
        "contraindications": ["Aspirin allergy", "Pregnancy"],
    },
]


async def seed_ingredients():
    """Seed the ingredients table with curated data."""
    engine = create_async_engine(settings.database_url, echo=True)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        for ingredient_data in SEED_INGREDIENTS:
            # Check if ingredient already exists
            result = await session.execute(
                select(Ingredient).where(
                    Ingredient.canonical_name == ingredient_data["canonical_name"]
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                print(f"Skipping {ingredient_data['canonical_name']} - already exists")
                continue

            ingredient = Ingredient(**ingredient_data)
            session.add(ingredient)
            print(f"Added {ingredient_data['canonical_name']}")

        await session.commit()
        print(f"\nSeeded {len(SEED_INGREDIENTS)} ingredients")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_ingredients())
