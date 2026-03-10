# NourAI Backend

FastAPI backend for the NourAI health product scanner. Manages products, ingredients, evidence from PubMed research, and user health profiles.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | Python 3.13 |
| Framework | FastAPI 0.115 + uvicorn |
| Database | PostgreSQL 16 (Supabase in production, Docker locally) |
| ORM | SQLAlchemy 2.0 async |
| Migrations | Alembic |
| Auth | Supabase JWT (HS256) |
| Storage | Supabase Storage (product images) |
| AI research | Claude Haiku + PubMed E-utilities |
| Payments | RevenueCat webhooks |

---

## Prerequisites

- Python 3.13
- Docker Desktop (for local PostgreSQL)
- `make` (pre-installed on macOS/Linux)

---

## First-time setup

```bash
make setup
```

This creates a `venv/`, installs all dependencies, and copies `.env.example` to `.env`.

Then open `.env` and fill in your values — at minimum `ANTHROPIC_API_KEY` is needed to run the research agent.

---

## Local development workflow

### 1 — First run (fresh database)

```bash
make setup            # create venv, install deps, copy .env.example → .env
                      # → fill in .env before continuing

make up               # start PostgreSQL on port 5432 (Docker)
make migrate          # apply all Alembic migrations
make seed             # load the golden set: 23 ingredients + 15 real products
make fetch-products   # expand to ~4 500 products from Open Food Facts + Open Beauty Facts
make research         # enrich first 5 ingredients with PubMed evidence (test run)
make dev              # start API with hot reload → http://localhost:8001
```

### 2 — Populate the full database

Run these after `make seed` to build a production-quality dataset.

```bash
# Step 1 — expand products (takes ~10 min, no API cost)
make fetch-products

# Step 2 — dry-run the research agent to see what will be processed
make research-dry

# Step 3 — enrich all ingredients (uses Anthropic API, ~$3–6 one-time)
make research-all
```

After `make research-all` completes, every ingredient has:
- PubMed evidence records with confidence, direction, concern/goal tags
- A `common_belief` vs `evidence_reality` summary (plain English, Claude Sonnet)

### 3 — Day-to-day commands

```bash
make dev              # start API (hot reload)
make research         # enrich next 5 pending ingredients
make research-retry   # retry any that previously failed
make fetch-products   # pull new products from OpenFoodFacts (idempotent)
make migrate          # apply any new migrations after a git pull
make reset            # full wipe → re-migrate → re-seed (destructive)
make logs             # tail PostgreSQL logs
make down             # stop Docker containers
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in the values below.

### Required for all environments

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string. Local: `postgresql+asyncpg://postgres:postgres@localhost:5432/postgres`. Supabase: `postgresql+asyncpg://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres` |
| `SUPABASE_URL` | Your Supabase project URL (`https://[project].supabase.co`) |
| `SUPABASE_JWT_SECRET` | Found at Project Settings → API → JWT Secret |

### Required for research agent

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | From [console.anthropic.com](https://console.anthropic.com) |
| `NCBI_API_KEY` | Optional — increases PubMed from 3 req/s to 10 req/s. Free at [ncbi.nlm.nih.gov/account](https://www.ncbi.nlm.nih.gov/account/) |

### Required for image upload

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role (secret key) |
| `SUPABASE_STORAGE_BUCKET` | Bucket name (default: `product-images`) |

### Required for payments

| Variable | Description |
|----------|-------------|
| `REVENUECAT_WEBHOOK_SECRET` | From RevenueCat dashboard → Webhooks |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVIRONMENT` | `development` | `development` or `production` |
| `DEBUG` | `true` | Enables SQL query logging |
| `OPENFOODFACTS_USER_AGENT` | `NourAI/1.0` | Identifies your app to OpenFoodFacts |

---

## Project structure

```
backend-nourai/
├── app/
│   ├── api/v1/          # FastAPI route handlers
│   ├── core/
│   │   ├── config.py    # Pydantic settings (reads from .env)
│   │   └── security.py  # Supabase JWT verification
│   ├── db/
│   │   ├── base.py      # Base model mixins (UUIDMixin, TimestampMixin)
│   │   └── session.py   # Async engine + session factory
│   ├── models/
│   │   ├── ingredient.py          # Ingredient + ResearchStatus
│   │   ├── ingredient_evidence.py # PubMed evidence records (per ingredient)
│   │   ├── product.py             # Product + ProductIngredient
│   │   └── claim.py               # Marketing claim evidence
│   ├── schemas/         # Pydantic request/response schemas
│   ├── services/        # Business logic
│   └── main.py          # FastAPI app entry point
├── alembic/
│   └── versions/        # Migration files (001 → 003)
├── scripts/
│   ├── seed_golden_set.py         # 23 curated ingredients + 15 real products (run first)
│   ├── fetch_popular_products.py  # Expands to ~4 500 products via OpenFoodFacts + OpenBeautyFacts
│   ├── research_agent.py          # PubMed → Claude Haiku synthesis + Sonnet belief/reality summary
│   └── upload_product_images.py   # Re-hosts images to Supabase Storage
├── docker-compose.yml
├── Dockerfile
├── Makefile
├── requirements.txt
└── .env.example
```

---

## Migrations

Migrations live in `alembic/versions/`. Files are numbered (`001_`, `002_`, …) and written manually to keep changes explicit.

```bash
# Apply all pending migrations
make migrate

# Roll back one step
make migrate-down

# Check which migration is currently applied
make migration-status

# Create a new migration file (then edit it manually)
. venv/bin/activate && alembic revision -m "describe_change"
```

---

## Scripts

### `scripts/seed_golden_set.py`

Loads a curated set of 23 ingredients and 15 real products into the database. Idempotent — safe to run multiple times (skips existing records by canonical name / barcode).

```bash
make seed
```

### `scripts/fetch_popular_products.py`

Expands the golden set with real, popular products pulled from [Open Food Facts](https://world.openfoodfacts.org/) and [Open Beauty Facts](https://world.openbeautyfacts.org/). Products are sorted by `unique_scans_n` (real scan count) so the most widely used items are imported first.

- Covers 15 categories: dietary supplements, proteins, vitamins, energy drinks, dairy, plant-based, snacks, beverages, baby food, condiments, cereals, moisturisers, sunscreen, serums, shampoos
- Target: ~4 500 products
- Matches product ingredients against the canonical `ingredients` table (exact → synonym → substring)
- Idempotent: skips products whose barcode already exists

```bash
make fetch-products          # full run (~4 500 products, no API cost)
make fetch-products-dry      # preview without writing to DB
make fetch-products-test     # import only 10 products per category (quick test)
```

### `scripts/research_agent.py`

4-step pipeline per ingredient:

1. Search PubMed for relevant studies (E-utilities API)
2. Fetch up to 10 abstracts
3. Synthesise each abstract with **Claude Haiku** → structured finding (direction, confidence, concern/goal tags)
4. Generate `common_belief` + `evidence_reality` summary with **Claude Sonnet** — what people *think* the ingredient does vs. what clinical evidence *actually* says

Results are stored in `ingredient_evidence` rows and as prose fields on the `ingredients` table.

```bash
make research           # enrich next 5 pending ingredients (good for testing)
make research-all       # enrich all pending ingredients
make research-dry       # preview without making any API calls
make research-retry     # retry ingredients with status = failed

# Target a specific ingredient by name
. venv/bin/activate && python scripts/research_agent.py --ingredient "Creatine"
```

**Cost estimate:** ~$0.012/ingredient (Haiku × abstracts + Sonnet × summary). Full 300-ingredient run ≈ $3–6 one-time.

### `scripts/upload_product_images.py`

Downloads placeholder images (Unsplash, OpenFoodFacts) and re-hosts them in Supabase Storage so the app never depends on third-party URLs.

Requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a public bucket named `product-images` created in the Supabase dashboard (Storage → New Bucket → toggle Public ON).

```bash
make images             # upload all pending product images
make images-dry         # preview without uploading

# Single product
. venv/bin/activate && python scripts/upload_product_images.py --product-id <uuid>
```

---

## API

The API is available at `http://localhost:8001` in development.

- **Interactive docs (Swagger):** http://localhost:8001/docs
- **ReDoc:** http://localhost:8001/redoc

### Key endpoints

```
# Products
GET  /api/v1/products/                      List / filter products (?category=&search=)
GET  /api/v1/products/search/{query}        Search by name/brand (?generate_if_not_found=true)
GET  /api/v1/products/{id}                  Product detail (ingredients include ingredient_id FK)
GET  /api/v1/products/{id}/personalize      Server-side personalization overlay
GET  /api/v1/products/barcode/{barcode}     Barcode lookup

# Ingredients
GET  /api/v1/ingredients/search?q=          Search canonical ingredients by name
GET  /api/v1/ingredients/{id}               Full ingredient deep dive:
                                              mechanism, common_belief, evidence_reality,
                                              dose/safety info, PubMed evidence records,
                                              found-in products

# Users
POST /api/v1/users/me/profile               Save onboarding profile
GET  /api/v1/users/me/profile               Get user health profile
GET  /api/v1/users/me/history               Scan history
POST /api/v1/users/me/history               Add scan to history
GET  /api/v1/users/me/stack                 User's product stack
POST /api/v1/users/me/stack                 Add product to stack
DELETE /api/v1/users/me/stack/{id}          Remove from stack

# Meals
POST /api/v1/meals/analyze                  Analyze meal photo or description (Claude AI)

# Payments
POST /api/v1/webhooks/revenuecat            RevenueCat subscription webhook
```

---

## Deployment

### Railway (recommended)

Railway auto-detects the `Dockerfile` and runs the service with zero config.

1. Create a new project at [railway.app](https://railway.app)
2. Connect your GitHub repository
3. Add a **PostgreSQL** service (Railway provides managed Postgres)
4. Set environment variables in the Railway dashboard (copy from `.env`, use Supabase's production `DATABASE_URL`)
5. Railway deploys on every push to `main`

After first deploy, run migrations once:

```bash
railway run alembic upgrade head
```

### Render

1. New Web Service → connect repo → select `backend-nourai/` as root directory
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add a PostgreSQL database add-on
5. Set environment variables

### Docker (self-hosted)

```bash
docker build -t nourai-api .
docker run -p 8000:8000 \
  -e DATABASE_URL="postgresql+asyncpg://..." \
  -e SUPABASE_URL="..." \
  -e SUPABASE_JWT_SECRET="..." \
  -e ANTHROPIC_API_KEY="..." \
  nourai-api
```

### Production checklist

- [ ] `ENVIRONMENT=production` and `DEBUG=false` in env vars
- [ ] `DATABASE_URL` points to Supabase Postgres (not localhost)
- [ ] Run `alembic upgrade head` after each deploy
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set (for image uploads)
- [ ] `ANTHROPIC_API_KEY` set (for research agent)
- [ ] Supabase Storage bucket `product-images` created and set to **Public**
- [ ] CORS origins updated in `app/main.py` to your production domain
