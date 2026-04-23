# Prodlyft

Paste any product URL → get back structured, merchant-ready product data (title, description, price, images, categories, tags), ready to export to WooCommerce or Shopify.

```
frontend (Next.js 14 · Tailwind)  ──►  backend (FastAPI)  ──►  Redis queue  ──►  RQ worker (Playwright + OpenRouter AI)  ──►  Postgres
```

## Quick start (Docker)

```bash
cd prodlyft
cp backend/.env.example backend/.env     # then paste your OPENROUTER_API_KEY
docker compose up --build
```

- Frontend: http://localhost:3000
- API:      http://localhost:8000/health

Without an `OPENROUTER_API_KEY` the worker still runs — it just skips the AI cleanup step and returns the raw scraped fields.

## Local dev (no Docker)

Three terminals:

```bash
# 1. infra
docker run -d --name prodlyft-pg  -p 5432:5432 \
  -e POSTGRES_USER=prodlyft -e POSTGRES_PASSWORD=prodlyft -e POSTGRES_DB=prodlyft postgres:16-alpine
docker run -d --name prodlyft-redis -p 6379:6379 redis:7-alpine

# 2. backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
cp .env.example .env    # edit as needed (DATABASE_URL uses localhost here)
# change DATABASE_URL in .env to postgresql+psycopg://prodlyft:prodlyft@localhost:5432/prodlyft
uvicorn app.main:app --reload
# in another shell:
python worker.py

# 3. frontend
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

## API

| Method | Path | Description |
| --- | --- | --- |
| POST  | `/import`       | `{ url }` → `{ job_id }`. Queues a scrape + AI-cleanup job. |
| GET   | `/job/{id}`     | Returns status (`pending` \| `processing` \| `done` \| `failed`), live `progress.step`, final `result`. |
| GET   | `/jobs?limit=N` | Most-recent jobs, for the dashboard. |
| GET   | `/health`       | Liveness check. |

## Flow

1. User pastes a URL on `/` or `/imports/new`.
2. API creates a `Job` row (`pending`) and enqueues `process_import(job_id)` on Redis.
3. Worker picks it up: Playwright fetch → generic extractor (JSON-LD → HTML fallback) → OpenRouter AI cleanup → writes result to Postgres.
4. Frontend polls `/job/{id}` every 1.5s and renders the stepper live.
5. When `status === "done"`, the user sees the extracted product, can download JSON, or open the editor at `/products/{id}`.

## Project layout

```
prodlyft/
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI (POST /import, GET /job/{id}, GET /jobs)
│   │   ├── config.py       # env-backed settings
│   │   ├── db.py           # SQLAlchemy engine + Base
│   │   ├── models.py       # Job table
│   │   ├── schemas.py      # Pydantic request/response shapes
│   │   ├── queue.py        # RQ + Redis
│   │   ├── scraper.py      # Playwright + BeautifulSoup generic extractor
│   │   ├── ai.py           # OpenRouter cleanup (fallback if no API key)
│   │   └── worker.py       # RQ task: process_import(job_id)
│   ├── worker.py           # RQ worker entrypoint
│   ├── requirements.txt
│   ├── Dockerfile          # API
│   └── Dockerfile.worker   # Worker (Playwright image)
├── frontend/
│   ├── app/                # App Router pages (landing, dashboard, imports, products, integrations, automations)
│   ├── components/         # Sidebar, Topbar, Icons, Stepper, BrandMark
│   ├── lib/api.ts          # typed client for the backend
│   ├── tailwind.config.ts  # design tokens (warm off-white, ink, forest-green accent)
│   └── Dockerfile
└── docker-compose.yml
```

## Deployment

- **Backend (API + worker):** Railway — deploy `backend/Dockerfile` as the web service, `backend/Dockerfile.worker` as a background worker. Attach Railway Postgres + Redis add-ons (the wiring uses `DATABASE_URL` and `REDIS_URL` env vars).
- **Frontend:** Vercel — set `API_URL` env var to the Railway API URL; `next.config.js` rewrites `/api/*` through to it.

## Design system

Warm off-white `#FAFAF7`, ink `#0E0E0C`, forest-green accent `oklch(0.62 0.14 150)`. Inter for UI, JetBrains Mono for URLs and IDs. 6px small radii, 10px on cards. Sourced from the Claude Design handoff — see `/tmp/prodlyft-design/prodlyft/` for the original wireframes.
