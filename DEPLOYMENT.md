# Vercel deployment preparation

The repository is arranged as two independently deployable Vercel projects:

```text
AsianFoodBot/
├── app/                         Next.js storefront and admin UI
├── backend/
│   ├── app/                     FastAPI application
│   ├── data/afc/                Self-contained 100-product seed snapshot
│   ├── migrations/              Alembic migrations
│   ├── scripts/bootstrap_cloud.py
│   ├── requirements.txt         Production Python dependencies
│   ├── .python-version          Python 3.12
│   └── vercel.json              Python function configuration
├── scripts/scrape_afc.py        Local snapshot refresh utility
├── package.json                 Standard Next.js commands
└── vercel.json                  Frontend project configuration
```

## Before creating Vercel projects

1. Create a Neon project and copy its pooled PostgreSQL connection string.
2. Create a Qdrant Cloud free cluster, then create a database API key.
3. Rotate the previously exposed OpenAI key and put the replacement only in local/Vercel secrets.
4. Put the cloud values into the local ignored `.env` temporarily.
5. Initialize the cloud stores from the repository root:

   ```bash
   PYTHONPATH=backend .venv/bin/python backend/scripts/bootstrap_cloud.py
   ```

This applies Alembic migrations, upserts 100 products into Neon, and indexes the 27 FAQ/location vectors in Qdrant. It is safe to run repeatedly.

## Backend Vercel project

Import the Git repository into Vercel using:

- Project name: `afc-grocery-api`
- Root Directory: `backend`
- Framework Preset: `Other`
- Build and output settings: leave blank

Copy every variable from `backend/.env.vercel.example` into the Vercel project settings. Set `FRONTEND_ORIGINS` after the frontend URL is known and redeploy if needed.

Expected backend checks:

```text
https://YOUR-BACKEND.vercel.app/health
https://YOUR-BACKEND.vercel.app/docs
```

The FastAPI application is one Python function with a 300-second maximum duration. Migrations and initial seeding are not performed during cold starts.

## Frontend Vercel project

Import the same Git repository a second time using:

- Project name: `afc-grocery-demo`
- Root Directory: repository root
- Framework Preset: `Next.js`
- Build Command: `npm run build`

Add:

```env
NEXT_PUBLIC_API_URL=https://YOUR-BACKEND.vercel.app
```

Deploy, then update the backend `FRONTEND_ORIGINS` to the final frontend URL.

## Production checks

1. Open the storefront and submit a product-only question.
2. Submit a policy-only question.
3. Submit `Which products are under $5, and can sale items be returned?` and confirm both `product` and `faq` sources appear.
4. Log into `/admin` and verify FAQ listing and editing.
5. Trigger one admin sync and confirm a completed `sync_runs` record in Neon.

For separate frontend and backend domains, `SECURE_COOKIES=true` and `SESSION_COOKIE_SAMESITE=none` are required for the admin cookie. Keep `credentials: include` enabled in the frontend, as it is now.
