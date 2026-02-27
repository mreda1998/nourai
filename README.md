# NourAI

Evidence-backed health product scanner for iOS and Android. Scan any food, supplement, or cosmetic to see what its ingredients actually do — filtered to your health profile.

```
nourai/
├── nourai/           # React Native / Expo app  (iOS & Android)
└── backend-nourai/   # FastAPI backend          (Python 3.13)
```

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Frontend toolchain |
| Python | 3.13 | Backend |
| Docker Desktop | latest | Local PostgreSQL |
| Xcode | 16+ | iOS simulator (macOS only) |
| Expo CLI | via npx | Metro bundler |

---

## Quick start (local)

### 1 — Backend

```bash
cd backend-nourai

# First time only
make setup              # creates venv, installs deps, copies .env.example → .env
# Edit .env — add your ANTHROPIC_API_KEY at minimum

make up                 # start PostgreSQL in Docker
make migrate            # run Alembic migrations
make seed               # load 23 ingredients + 15 products (golden set)
make dev                # API on http://localhost:8001
```

API docs → http://localhost:8001/docs

### 2 — Frontend

```bash
cd nourai

npm install

# Update the API URL if needed (services/api.ts line 9)
# Default: http://localhost:8001/api/v1

npx expo start          # press i for iOS simulator, a for Android
```

---

## Detailed docs

- [Backend →](./backend-nourai/README.md) — environment variables, scripts, migrations, deployment
- [Frontend →](./nourai/README.md) — environment setup, EAS build, App Store submission
