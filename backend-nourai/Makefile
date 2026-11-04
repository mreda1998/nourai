# Elory Backend — development commands
# Usage: make <target>

VENV = . venv/bin/activate &&
PYTHON = $(VENV) python3

.PHONY: help up down logs migrate seed seed-peptides images research dev worker worker-once import-lab import-rules curate-rules review-rules tester-report reset test backfill-links backfill-usda seed-whole-foods seed-fragrance seed-luxury-perfumes fetch-sephora enrich-pubchem start seed-golden-set seed-golden-set-dry suggest-new-ingredients suggest-new-ingredients-more research-atelier

help:
	@echo ""
	@echo "  NourAI Backend"
	@echo "  ─────────────────────────────────────────"
	@echo "  make start             ★ Full dev setup in one command (Docker + venv + migrate + research + server)"
	@echo "  make up                Start local PostgreSQL"
	@echo "  make down              Stop containers"
	@echo "  make migrate           Run all pending migrations"
	@echo "  make seed              Seed the golden set (products + ingredients)"
	@echo "  make seed-peptides     Seed 20 curated peptides (run after migrate)"
	@echo "  make enqueue-barcodes FILE=… Queue a prioritized GTIN manifest in batches"
	@echo "  make fetch-products    Legacy search-API importer (do not use for scale)"
	@echo "  make seed-fragrance    Seed EU fragrance allergen ingredients (run before fetch-products)"
	@echo "  make seed-luxury-perfumes  Seed ~70 curated luxury perfumes (Chanel, Dior, LV, Creed...)"
	@echo "  make fetch-sephora         Fetch thousands of luxury fragrances from Sephora (RAPIDAPI_KEY)"
	@echo "  make enrich-pubchem        Enrich ingredients with NIH PubChem GHS safety data (free)"
	@echo "  make seed-golden-set       Seed 2,500-ingredient golden set from CSV (PENDING)"
	@echo "  make suggest-new-ingredients  Show top unmatched ingredients for next batch"
	@echo "  make images            Upload product images → Supabase Storage"
	@echo "  make research          Run research agent on pending ingredients (limit 5)"
	@echo "  make research-all      Run research agent on ALL pending ingredients"
	@echo "  make research-atelier  Enrich complete ingredients with timing + interactions"
	@echo "  make dev               Start the API server (hot reload)"
	@echo "  make worker            Start the durable ingestion worker"
	@echo "  make worker-once       Process at most one queued ingestion job"
	@echo "  make import-lab FILE=… Import a versioned public lab-results manifest"
	@echo "  make import-rules SOURCE=… [FILE=…] [DERIVE=1]  Import an official regulatory list"
	@echo "  make tester-report     HTML report: tester scans, missing products, research priority"
	@echo "  make reset             Full reset: wipe DB, re-migrate, re-seed"
	@echo "  make logs              Tail PostgreSQL logs"
	@echo ""

# ─── One-command dev start ────────────────────────────────────────────────────
# Runs everything needed to get from zero to a running server:
#   1. Start Docker Desktop if not running
#   2. Kill any existing process on port 8001
#   3. Create/update venv and install dependencies
#   4. Start PostgreSQL
#   5. Apply all pending migrations
#   6. Run research agent on 5 ingredients (no images, fast)
#   7. Start the dev server with hot reload

start:
	@echo ""
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "  NourAI — full dev start"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo ""
	@# ── Step 1: ensure Docker Desktop is running ──────────────────────────
	@echo "[1/6] Checking Docker..."
	@if ! docker info > /dev/null 2>&1; then \
		echo "      Docker not running — launching Docker Desktop..."; \
		open -a Docker; \
		echo "      Waiting for Docker to start (up to 60s)..."; \
		for i in $$(seq 1 30); do \
			sleep 2; \
			docker info > /dev/null 2>&1 && break; \
			echo "      Still waiting... ($$(expr $$i \* 2)s)"; \
		done; \
		docker info > /dev/null 2>&1 || (echo "ERROR: Docker did not start in time. Open Docker Desktop manually and retry." && exit 1); \
	fi
	@echo "      Docker is running."
	@echo ""
	@# ── Step 2: kill anything already on port 8001 ────────────────────────
	@echo "[2/6] Freeing port 8001..."
	@lsof -ti:8001 | xargs kill -9 2>/dev/null && echo "      Killed existing process on :8001" || echo "      Port 8001 is free."
	@echo ""
	@# ── Step 3: venv + dependencies ──────────────────────────────────────
	@echo "[3/6] Setting up Python environment..."
	@test -d venv || python3 -m venv venv
	@. venv/bin/activate && pip install -r requirements.txt -q
	@echo "      Dependencies up to date."
	@echo ""
	@# ── Step 4: start postgres ────────────────────────────────────────────
	@echo "[4/6] Starting PostgreSQL..."
	@$(MAKE) up --no-print-directory
	@echo ""
	@# ── Step 5: migrate ──────────────────────────────────────────────────
	@echo "[5/6] Running migrations..."
	@$(MAKE) migrate --no-print-directory
	@echo ""
	@# ── Step 6: quick research run (5 ingredients, no images) ────────────
	@echo "[6/6] Running research agent (5 ingredients, no images)..."
	@$(PYTHON) scripts/research_agent.py --limit 5 --skip-images
	@echo ""
	@# ── Start server ─────────────────────────────────────────────────────
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "  Starting dev server on http://localhost:8001"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo ""
	@$(MAKE) dev --no-print-directory

# ─── Database ─────────────────────────────────────────────────────────────────

up:
	@# Start Docker Desktop if docker daemon is not yet reachable
	@if ! docker info > /dev/null 2>&1; then \
		echo "Docker daemon not running — launching Docker Desktop..."; \
		open -a Docker; \
		echo "Waiting for Docker to start..."; \
		for i in $$(seq 1 30); do sleep 2; docker info > /dev/null 2>&1 && break; done; \
	fi
	docker-compose up -d postgres
	@echo "Waiting for PostgreSQL to be ready..."
	@sleep 3
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

# ─── Durable ingestion ───────────────────────────────────────────────────────

worker:
	$(PYTHON) -m app.workers.ingestion

worker-once:
	$(PYTHON) -m app.workers.ingestion --once

enqueue-barcodes:
	$(PYTHON) -m scripts.enqueue_barcodes $(FILE)

import-lab:
	$(PYTHON) -m scripts.import_lab_results $(FILE)

import-rules:
	$(PYTHON) -m scripts.import_regulatory_list $(SOURCE) $(if $(FILE),--file $(FILE),) $(if $(DERIVE),--derive,)

# ─── Tester insights ─────────────────────────────────────────────────────────

# HTML report of what testers scan, what we're missing and what to research
# next. Optional: ARGS="--days 7" or ARGS="--out /tmp/report.html".
tester-report:
	$(PYTHON) -m scripts.tester_report $(ARGS)

# ─── Seeding ──────────────────────────────────────────────────────────────────

seed:
	$(PYTHON) scripts/seed_golden_set.py
	@echo ""
	@echo "Golden set seeded. Run 'make research' to enrich with PubMed studies."

seed-peptides:
	$(PYTHON) scripts/seed_peptides.py
	@echo ""
	@echo "Peptides seeded. Run 'make research-all' to populate PubMed evidence."

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

structures:
	$(PYTHON) scripts/generate_ingredient_structures.py
	@echo ""
	@echo "Ingredient structure images generated with RDKit."

structures-dry:
	$(PYTHON) scripts/generate_ingredient_structures.py --dry-run

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
#   6. make import-rules SOURCE=eu-cosing-ii (…-iii … -vi)  ← EU cosmetics annexes as rules (free)
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

# ─── Golden set v2 ────────────────────────────────────────────────────────────

seed-golden-set:
	$(PYTHON) scripts/seed_golden_set_v2.py
	@echo ""
	@echo "Golden set seeded. Run 'make research-all' to enrich PENDING ingredients."

seed-golden-set-dry:
	$(PYTHON) scripts/seed_golden_set_v2.py --dry-run

suggest-new-ingredients:
	$(PYTHON) scripts/suggest_new_ingredients.py

suggest-new-ingredients-more:
	$(PYTHON) scripts/suggest_new_ingredients.py --limit 100

research-dry:
	$(PYTHON) scripts/research_agent.py --dry-run

research-retry:
	$(PYTHON) scripts/research_agent.py --retry-failed

research-atelier:
	$(PYTHON) scripts/research_agent.py --atelier

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
