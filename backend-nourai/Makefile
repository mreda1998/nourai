# NourAI Backend — development commands
# Usage: make <target>

VENV = . venv/bin/activate &&
PYTHON = $(VENV) python3

.PHONY: help up down logs migrate seed images research dev reset test

help:
	@echo ""
	@echo "  NourAI Backend"
	@echo "  ─────────────────────────────────────────"
	@echo "  make up                Start local PostgreSQL"
	@echo "  make down              Stop containers"
	@echo "  make migrate           Run all pending migrations"
	@echo "  make seed              Seed the golden set (products + ingredients)"
	@echo "  make fetch-products    Expand golden set from Open Food Facts + Beauty Facts"
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
