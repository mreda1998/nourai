"""Seed sample products for development."""
import asyncio
from uuid import uuid4

from sqlalchemy import text

from app.database import async_session_maker


# Sample products with real or placeholder images
SAMPLE_PRODUCTS = [
    {
        "name": "Hydrating Serum",
        "brand": "SkinGlow",
        "category": "cosmetic",
        "subcategory": "Face",
        "barcode": "8901234567890",
        "image_url": "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=200&h=200&fit=crop",
        "summary": "Hyaluronic Acid & B5 Complex for deep hydration",
        "health_score": 98,
        "key_actives": "Hyaluronic Acid, Vitamin B5, Niacinamide",
        "price": "$28.00",
    },
    {
        "name": "Organic Multivitamin",
        "brand": "Nature's Best",
        "category": "supplement",
        "subcategory": "Health",
        "barcode": "7501234567891",
        "image_url": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=200&h=200&fit=crop",
        "summary": "Whole food blend for daily nutritional support",
        "health_score": 74,
        "key_actives": "Vitamin D3, B12, Iron, Zinc",
        "price": "$34.99",
    },
    {
        "name": "Botanical Shampoo",
        "brand": "PureRoots",
        "category": "cosmetic",
        "subcategory": "Hair",
        "barcode": "6901234567892",
        "image_url": "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=200&h=200&fit=crop",
        "summary": "Sulfate-free formula with Argan Oil",
        "health_score": 95,
        "key_actives": "Argan Oil, Aloe Vera, Tea Tree",
        "price": "$18.50",
    },
    {
        "name": "Plant Protein",
        "brand": "VegaFuel",
        "category": "food",
        "subcategory": "Nutrition",
        "barcode": "5901234567893",
        "image_url": "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=200&h=200&fit=crop",
        "summary": "Vanilla Bean flavor with Organic Pea Protein",
        "health_score": 42,
        "key_actives": "Pea Protein, Rice Protein",
        "price": "$39.99",
    },
    {
        "name": "Omega-3 Fish Oil",
        "brand": "OceanPure",
        "category": "supplement",
        "subcategory": "Health",
        "barcode": "4901234567894",
        "image_url": "https://images.unsplash.com/photo-1577401239170-897942555fb3?w=200&h=200&fit=crop",
        "summary": "Wild-caught fish oil with EPA & DHA",
        "health_score": 92,
        "key_actives": "EPA 500mg, DHA 250mg",
        "price": "$24.99",
    },
    {
        "name": "Probiotic Complex",
        "brand": "GutHealth",
        "category": "supplement",
        "subcategory": "Health",
        "barcode": "3901234567895",
        "image_url": "https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=200&h=200&fit=crop",
        "summary": "50 Billion CFU with 12 strains",
        "health_score": 88,
        "key_actives": "Lactobacillus, Bifidobacterium",
        "price": "$29.99",
    },
    {
        "name": "Vitamin D3 Drops",
        "brand": "SunVita",
        "category": "supplement",
        "subcategory": "Health",
        "barcode": "2901234567896",
        "image_url": "https://images.unsplash.com/photo-1631390179406-b4ae0a9c6f71?w=200&h=200&fit=crop",
        "summary": "2000 IU per drop, MCT oil base",
        "health_score": 96,
        "key_actives": "Vitamin D3 (Cholecalciferol)",
        "price": "$15.99",
    },
    {
        "name": "Collagen Peptides",
        "brand": "BeautyBlend",
        "category": "supplement",
        "subcategory": "Health",
        "barcode": "1901234567897",
        "image_url": "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=200&h=200&fit=crop",
        "summary": "Grass-fed hydrolyzed collagen types I & III",
        "health_score": 85,
        "key_actives": "Collagen Types I & III",
        "price": "$32.00",
    },
    {
        "name": "Green Superfood Powder",
        "brand": "VitalGreens",
        "category": "food",
        "subcategory": "Nutrition",
        "barcode": "0901234567898",
        "image_url": "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=200&h=200&fit=crop",
        "summary": "Organic blend of 30+ superfoods",
        "health_score": 68,
        "key_actives": "Spirulina, Chlorella, Wheatgrass",
        "price": "$44.99",
    },
    {
        "name": "Magnesium Glycinate",
        "brand": "CalmMind",
        "category": "supplement",
        "subcategory": "Health",
        "barcode": "9801234567899",
        "image_url": "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=200&h=200&fit=crop",
        "summary": "Highly absorbable magnesium for relaxation",
        "health_score": 94,
        "key_actives": "Magnesium Glycinate 400mg",
        "price": "$22.99",
    },
]


async def seed_products():
    """Seed sample products into the database."""
    async with async_session_maker() as session:
        # Check if products already exist
        result = await session.execute(text("SELECT COUNT(*) FROM products"))
        count = result.scalar()
        if count and count > 0:
            print(f"Products already seeded ({count} found), skipping...")
            return

        print("Seeding sample products...")

        for product_data in SAMPLE_PRODUCTS:
            product_id = str(uuid4())

            await session.execute(
                text("""
                    INSERT INTO products (id, barcode, name, brand, category, subcategory,
                        image_url, summary, key_actives, price, health_score, created_at, updated_at)
                    VALUES (:id, :barcode, :name, :brand, CAST(:category AS productcategory), :subcategory,
                        :image_url, :summary, :key_actives, :price, :health_score, NOW(), NOW())
                """),
                {
                    "id": product_id,
                    "barcode": product_data.get("barcode"),
                    "name": product_data["name"],
                    "brand": product_data["brand"],
                    "category": product_data["category"],
                    "subcategory": product_data.get("subcategory"),
                    "image_url": product_data.get("image_url"),
                    "summary": product_data.get("summary"),
                    "key_actives": product_data.get("key_actives"),
                    "price": product_data.get("price"),
                    "health_score": product_data.get("health_score"),
                }
            )
            print(f"  Added: {product_data['name']}")

        await session.commit()
        print(f"\nSeeded {len(SAMPLE_PRODUCTS)} products successfully!")


if __name__ == "__main__":
    asyncio.run(seed_products())
