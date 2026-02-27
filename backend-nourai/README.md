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

```bash
make up          # start PostgreSQL on port 5432 (Docker)
make migrate     # apply all pending Alembic migrations
make seed        # load the golden set (23 ingredients + 15 products)
make images      # upload product images to Supabase Storage (needs SUPABASE_* vars)
make research    # enrich first 5 ingredients with PubMed studies (needs ANTHROPIC_API_KEY)
make dev         # start API with hot reload on http://localhost:8001
```

### Other useful commands

```bash
make research-all     # run research agent on ALL pending ingredients
make research-dry     # preview what would be researched (no API calls)
make research-retry   # retry ingredients that previously failed
make images-dry       # preview image uploads without making changes
make migrate-down     # roll back one migration
make migration-status # show current migration head
make reset            # full wipe: stop containers → re-migrate → re-seed
make logs             # tail PostgreSQL logs
make down             # stop all Docker containers
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
│   └── versions/        # Migration files
├── scripts/
│   ├── seed_golden_set.py         # Seeds 23 ingredients + 15 products
│   ├── research_agent.py          # PubMed → Claude synthesis pipeline
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

### `scripts/research_agent.py`

Fetches PubMed studies for every ingredient, synthesizes each abstract with Claude Haiku, and stores structured evidence records (`ingredient_evidence` table).

```bash
make research           # 5 ingredients (testing)
make research-all       # all pending ingredients
make research-dry       # preview without API calls
make research-retry     # retry failed ingredients

# Target a specific ingredient
. venv/bin/activate && python scripts/research_agent.py --ingredient "Niacinamide"
```

Evidence per ingredient: study type, population, finding (plain English), direction (benefit/risk/neutral/mixed), confidence (high/moderate/low), and concern/goal tags that map to the onboarding profile.

**Cost estimate:** ~$0.003/ingredient (10 abstracts × Claude Haiku). Full 500-ingredient run ≈ $1.65 one-time.

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
GET  /api/v1/products/                      List / search products
GET  /api/v1/products/{id}                  Product detail
GET  /api/v1/products/barcode/{barcode}     Barcode lookup
GET  /api/v1/ingredients/                   List ingredients
GET  /api/v1/ingredients/{id}/evidence      PubMed evidence for an ingredient
POST /api/v1/users/me/profile               Save onboarding profile
GET  /api/v1/users/me/profile               Get user health profile
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
