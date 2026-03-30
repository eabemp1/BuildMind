# EvolvAI OS

EvolvAI OS is a founder execution platform with a FastAPI backend and Next.js frontend.

## Stack

- Backend: FastAPI + SQLAlchemy
- Frontend: Next.js (App Router)
- Database: PostgreSQL (production), SQLite (local fallback)
- Migrations: Alembic
- Production server: Gunicorn + Uvicorn workers

## Environment Configuration

Copy `.env.example` to `.env` and fill values:

```bash
cp .env.example .env
```

Required keys:

- `DATABASE_URL`
- `SECRET_KEY`
- `OPENAI_API_KEY`
- `GROQ_API_KEY`
- `JWT_SECRET`

Optional:

- `FRONTEND_ORIGINS` (comma-separated)
- `LOG_LEVEL`

## Local Development

### Backend

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/macOS
source venv/bin/activate

pip install -r requirements.txt
```

Run migrations:

```bash
alembic upgrade head
```

Run API:

```bash
uvicorn app.main:app --reload
```

Health check:

- `GET /health`
- `GET /api/v1/health`

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

Run:

```bash
npm run dev
```

## Docker

Run backend + postgres + redis:

```bash
docker compose up --build
```

Backend: `http://localhost:8000`  
Postgres: `localhost:5432`  
Redis: `localhost:6379`

## Migrations

Generate migration:

```bash
alembic revision --autogenerate -m "describe change"
```

Apply migration:

```bash
alembic upgrade head
```

Migration files are in:

`app/db/migrations/`

## Deployment (Production)

1. Set production environment variables (`DATABASE_URL`, `JWT_SECRET`, etc.).
2. Run migrations:
   - `alembic upgrade head`
3. Start backend with Gunicorn:

```bash
gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 2 -b 0.0.0.0:8000
```

4. Deploy frontend separately (e.g., Vercel) with:
   - `NEXT_PUBLIC_API_BASE_URL=https://<backend-domain>/api/v1`

## API Notes

- Core APIs are exposed under `/api/v1/...`
- Legacy runtime routes are also available via `/api/v1` aliases

