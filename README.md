# AFC Grocery Prototype

A full-stack AFC Grocery demonstration with a 100-product storefront, mock cart and checkout, FAQ administration, and a rule-guided orchestrated RAG assistant.

## Source-of-truth contract

The assistant deliberately keeps two authorities separate:

| Question type | Source of truth | Retrieval |
| --- | --- | --- |
| Product name, price, stock, unit, collection, image, or product URL | PostgreSQL `products` table | Validated filters compiled to parameterized SQL, followed by lexical ranking |
| Policies, promotions, delivery, pickup, brand, contact, and other general facts | Qdrant general KB plus PostgreSQL chunk text | Metadata-filtered dense search + BM25, fused with reciprocal-rank fusion |
| Store address, city, and phone | PostgreSQL `locations` plus matching general KB evidence | Exact city matching + hybrid KB retrieval |
| Compound questions | All applicable authorities | Parallel retrieval branches, deduplication, then one evidence-only cited answer |

Products are never copied into Qdrant. The OpenAI planner can extract intent and filters, but a deterministic rule layer enforces the authority contract. The model cannot submit raw SQL: only the validated `ProductFilters` schema is converted into SQLAlchemy expressions.

## Included data

- 100 products collected from `afcgrocery.com`
- 508 category nodes
- 8 locations
- Brand, service, policy, and contact knowledge
- Source URLs and collection timestamp in `backend/data/afc/manifest.json`
- A 40-question retrieval evaluation set

The snapshot contains only publicly accessible website content. Synchronization upserts changed records and marks missing products inactive rather than deleting history.

## Run with Docker

1. Copy the environment template and set secrets:

   ```bash
   cp .env.example .env
   ```

2. Set `OPENAI_API_KEY`, `ADMIN_PASSWORD`, and a random `SESSION_SECRET` in `.env`.

3. Start the stack:

   ```bash
   docker compose up --build
   ```

4. Open the storefront at `http://localhost:3000`, API docs at `http://localhost:8000/docs`, and Qdrant at `http://localhost:6333/dashboard`.

Docker applies migrations and idempotently seeds PostgreSQL and the general KB from `backend/data/afc` before starting the API. Vercel initialization is deliberately separate from cold starts. Without an OpenAI key, rule-based planning and BM25 retrieval still work; dense Qdrant embeddings and model synthesis require the key.

## Run services directly

```bash
npm install
npm run dev

python -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
PYTHONPATH=backend .venv/bin/python backend/scripts/bootstrap_cloud.py
PYTHONPATH=backend .venv/bin/uvicorn app.main:app --reload --port 8000
```

PostgreSQL and Qdrant must be running, and `.env` must point to them. The frontend reads `NEXT_PUBLIC_API_URL`.

## Important endpoints

- `GET /health`
- `GET /api/products`, `/api/products/{id}`
- `GET /api/categories`, `/api/locations`
- `POST /api/chat` — server-sent events with planning status and a structured final result
- `POST /api/admin/login`, `POST /api/admin/logout`
- `GET|POST|PUT|DELETE /api/admin/faqs`
- `POST /api/admin/sync`, `GET /api/admin/sync/{run_id}`

The chat result includes `answer`, `answer_parts`, `sources`, `product_cards`, `filters_applied`, `confidence`, and `needs_clarification`.

## Verification

```bash
npm test
PYTHONPATH=backend .venv/bin/pytest -q backend/tests
```

The checkout is an explicit demonstration. It does not transmit payment details, create an order, or retain personal information. Production deployment additionally requires hosted PostgreSQL and Qdrant endpoints, an API host, HTTPS origins, secure cookies, and encrypted secrets.

See `DEPLOYMENT.md` for the two-project Vercel, Neon, and Qdrant deployment procedure.
