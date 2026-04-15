# Elory Backend — development commands
# Usage: make <target>

VENV = . venv/bin/activate &&
PYTHON = $(VENV) python3

.PHONY: help up down logs migrate seed images research dev reset test backfill-links backfill-usda seed-whole-foods seed-fragrance seed-luxury-perfumes fetch-sephora enrich-pubchem fetch-cosing

help:
	@echo ""
	@echo "  Elory Backend"
	@echo "  ─────────────────────────────────────────"
	@echo "  make up                Start local PostgreSQL"
	@echo "  make down              Stop containers"
	@echo "  make migrate           Run all pending migrations"
	@echo "  make seed              Seed the golden set (products + ingredients)"
	@echo "  make fetch-products    Expand product catalogue from Open Food Facts + Beauty Facts"
	@echo "  make seed-fragrance    Seed EU fragrance allergen ingredients (run before fetch-products)"
	@echo "  make seed-luxury-perfumes  Seed ~70 curated luxury perfumes (Chanel, Dior, LV, Creed...)"
	@echo "  make fetch-sephora         Fetch thousands of luxury fragrances from Sephora (RAPIDAPI_KEY)"
	@echo "  make enrich-pubchem        Enrich ingredients with NIH PubChem GHS safety data (free)"
	@echo "  make fetch-cosing          Apply EU CosIng ban/restriction data to ingredients (free)"
	@echo "  make images            Upload product images → Supabase Storage"
	@echo "  make research          Run research agent on pending ingredients (limit 5)"
	@echo "  make research-all      Run research agent on ALL pending ingredients"
	@echo "  make dev               Start the API server (hot reload)"
	@echo "  make reset             Full reset: wipe DB, re-migrate, re-seed"
	@echo "  make logs              Tail PostgreSQL logs"
	@echo ""

# ─── Database ─────────────────────────────────────────────────────────────────

up:
	docker-compose up -d postgres
	@echo "Waiting for PostgreSQL to be ready..."
	@sleep 2
	@echo "PostgreSQL is up on port 5432"

down:
	docker-compose down

logs:
	docker-compose logs -f postgres

# ─── Migrations ───────────────────────────────────────────────────────────────

migrate:
	$(VENV) alembic upgrade head

migrate-down:
	$(VENV) alembic downgrade -1

migration-status:
	$(VENV) alembic current

# ─── Seeding ──────────────────────────────────────────────────────────────────

seed:
	$(PYTHON) scripts/seed_golden_set.py
	@echo ""
	@echo "Golden set seeded. Run 'make research' to enrich with PubMed studies."

fetch-products:
	$(PYTHON) scripts/fetch_popular_products.py
	@echo ""
	@echo "Product fetch complete. Run 'make research-all' to enrich new ingredients."

fetch-products-dry:
	$(PYTHON) scripts/fetch_popular_products.py --dry-run

fetch-products-test:
	$(PYTHON) scripts/fetch_popular_products.py --limit 10

# ─── Image uploader ───────────────────────────────────────────────────────────

images:
	$(PYTHON) scripts/upload_product_images.py
	@echo ""
	@echo "Product images uploaded to Supabase Storage."

images-dry:
	$(PYTHON) scripts/upload_product_images.py --dry-run

# ─── Research agent ───────────────────────────────────────────────────────────

research:
	$(PYTHON) scripts/research_agent.py --limit 5

research-all:
	$(PYTHON) scripts/research_agent.py

research-no-images:
	$(PYTHON) scripts/research_agent.py --skip-images

backfill-links:
	$(PYTHON) scripts/backfill_ingredient_links.py --show-unmatched

backfill-links-dry:
	$(PYTHON) scripts/backfill_ingredient_links.py --dry-run --show-unmatched

backfill-usda:
	$(PYTHON) scripts/backfill_usda_nutrients.py
	@echo ""
	@echo "USDA nutriments backfill complete. Reload product screens to see nutrition data."

backfill-usda-dry:
	$(PYTHON) scripts/backfill_usda_nutrients.py --dry-run

backfill-usda-test:
	$(PYTHON) scripts/backfill_usda_nutrients.py --limit 5

seed-whole-foods:
	$(PYTHON) scripts/seed_whole_foods.py

seed-whole-foods-dry:
	$(PYTHON) scripts/seed_whole_foods.py --dry-run

seed-whole-foods-test:
	$(PYTHON) scripts/seed_whole_foods.py --limit 5

seed-fragrance:
	$(PYTHON) scripts/seed_fragrance_ingredients.py
	@echo ""
	@echo "Fragrance ingredients seeded. Run 'make fetch-products' to import perfumes from Open Beauty Facts."

seed-fragrance-dry:
	$(PYTHON) scripts/seed_fragrance_ingredients.py --dry-run

seed-luxury-perfumes:
	$(PYTHON) scripts/seed_luxury_perfumes.py
	@echo ""
	@echo "Luxury perfumes seeded. Run 'make research-all' to enrich with PubMed data."

seed-luxury-perfumes-dry:
	$(PYTHON) scripts/seed_luxury_perfumes.py --dry-run

seed-luxury-perfumes-brand:
	$(PYTHON) scripts/seed_luxury_perfumes.py --brand $(BRAND)

# ─── Fragrance data pipeline ──────────────────────────────────────────────────
# Full pipeline order:
#   1. make seed-fragrance          ← seed canonical allergen ingredients
#   2. make seed-luxury-perfumes    ← seed 70 hand-curated luxury perfumes
#   3. make fetch-sephora           ← fetch thousands more from Sephora (needs RAPIDAPI_KEY)
#   4. make fetch-products          ← fetch from Open Beauty Facts (perfumes + all cosmetics)
#   5. make enrich-pubchem          ← add GHS safety data from NIH PubChem (free)
#   6. make fetch-cosing            ← apply EU CosIng ban/restriction data (free)
#   7. make research-all            ← PubMed clinical evidence per ingredient
#   8. make backfill-links          ← re-link any unmatched product ingredients

fetch-sephora:
	$(PYTHON) scripts/fetch_sephora_products.py
	@echo ""
	@echo "Sephora fetch complete. Requires RAPIDAPI_KEY in .env"

fetch-sephora-dry:
	$(PYTHON) scripts/fetch_sephora_products.py --dry-run

fetch-sephora-women:
	$(PYTHON) scripts/fetch_sephora_products.py --category women

fetch-sephora-men:
	$(PYTHON) scripts/fetch_sephora_products.py --category men

enrich-pubchem:
	$(PYTHON) scripts/enrich_ingredients_pubchem.py
	@echo ""
	@echo "PubChem enrichment complete (GHS hazard codes, molecular data, synonyms)"

enrich-pubchem-dry:
	$(PYTHON) scripts/enrich_ingredients_pubchem.py --dry-run

fetch-cosing:
	$(PYTHON) scripts/fetch_cosing_data.py
	@echo ""
	@echo "EU CosIng data applied (Annex II bans, Annex III restrictions)"

fetch-cosing-dry:
	$(PYTHON) scripts/fetch_cosing_data.py --dry-run

fetch-cosing-report:
	$(PYTHON) scripts/fetch_cosing_data.py --dry-run --report-banned

research-dry:
	$(PYTHON) scripts/research_agent.py --dry-run

research-retry:
	$(PYTHON) scripts/research_agent.py --retry-failed

# ─── Dev server ───────────────────────────────────────────────────────────────

dev:
	$(VENV) uvicorn app.main:app --reload --host 0.0.0.0 --port 8001

# ─── Full reset ───────────────────────────────────────────────────────────────

reset: down
	docker-compose down -v
	$(MAKE) up
	sleep 3
	$(MAKE) migrate
	$(MAKE) seed
	@echo ""
	@echo "Reset complete. DB is fresh with golden set loaded."
	@echo "Run 'make research' to populate ingredient evidence."

# ─── Setup (first time) ───────────────────────────────────────────────────────

setup:
	python3 -m venv venv
	$(VENV) pip install -r requirements.txt
	cp -n .env.example .env || true
	@echo ""
	@echo "Setup complete. Edit .env then run:"
	@echo "  make up && make migrate && make seed"
