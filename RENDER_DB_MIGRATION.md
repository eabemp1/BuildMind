# ⚠️ URGENT: Render Free DB Expires April 26, 2026

Your free Render PostgreSQL database (`evoltrain-db`) will be **suspended on April 26** and deleted after a grace period.

## Option A — Supabase (Recommended, Free Forever)

Your frontend already uses Supabase. You can use the same Supabase project's PostgreSQL for the FastAPI backend too.

### Steps (takes ~5 minutes)

**1. Get your Supabase DB connection string**
- Go to [supabase.com](https://supabase.com) → your project → **Settings → Database**
- Copy the **Connection string** (URI format)
- It looks like: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`

**2. Update your environment variable on Render**
- Go to Render dashboard → your backend service → **Environment**
- Change `DATABASE_URL` to your Supabase connection string
- Click **Save** — Render will redeploy automatically

**3. Run migrations on the new DB**
```bash
# From your local machine with the new DATABASE_URL:
DATABASE_URL="postgresql://..." alembic upgrade head
```

**4. (Optional) Migrate existing data**
```bash
# Export from old Render DB (before April 26):
pg_dump $OLD_DATABASE_URL > backup.sql

# Import to Supabase:
psql $NEW_DATABASE_URL < backup.sql
```

That's it. No code changes needed — `DATABASE_URL` is the only thing that changes.

---

## Option B — Neon (Also Free, Postgres-compatible)

[neon.tech](https://neon.tech) offers a free PostgreSQL tier with no expiry.

- Create a project → copy the connection string
- Same steps as above (just a different `DATABASE_URL`)

---

## Option C — Upgrade Render DB ($7/month)

If you want to stay on Render:
- Render dashboard → `evoltrain-db` → **Upgrade**
- Starter plan is $7/month, no expiry

---

## What the FastAPI backend uses the DB for

The `DATABASE_URL` env var connects the FastAPI/SQLAlchemy backend to PostgreSQL. It stores:
- Users, projects, milestones, tasks
- Feedback, notifications, activity logs
- Weekly reports, execution scores
- Agent state (via `app_state` key-value table)

The Next.js frontend uses **Supabase directly** for auth and most real-time data — it is not affected by the Render DB expiry.

---

## Checklist before April 26

- [ ] Get Supabase DB connection string
- [ ] Update `DATABASE_URL` in Render backend environment
- [ ] Run `alembic upgrade head` against new DB
- [ ] Verify `/api/v1/health` returns `{"status": "ok"}`
- [ ] Export + import existing data if needed
