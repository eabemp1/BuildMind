# BuildMind — Vercel Deployment Guide

## Deploy by end of today — exact steps

---

## 1. Backend first (Railway — free tier)

Your backend needs to be live before the frontend can work.

### Option A: Railway (easiest, free $5/month credit)

1. Go to railway.app → New Project → Deploy from GitHub
2. Select your evolvai-mvp repo
3. Set Root Directory to: `/` (or wherever your backend lives)
4. Set Build Command: `pip install -r requirements.txt`
5. Set Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Add environment variables:
   ```
   DATABASE_URL=postgresql://...  (Railway gives you a Postgres addon)
   JWT_SECRET=<generate: python -c "import secrets; print(secrets.token_hex(32))">
   SECRET_KEY=<generate another one>
   GROQ_API_KEY=your_groq_key
   FRONTEND_ORIGINS=https://your-app.vercel.app
   ENVIRONMENT=production
   ```
7. Note the Railway URL: `https://your-app.railway.app`

### Option B: Render (free tier available)

Same steps. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

---

## 2. Frontend on Vercel

1. Push the frontend folder to GitHub (or your existing repo)
2. Go to vercel.com → New Project → Import your repo
3. Set **Framework**: Next.js
4. Set **Root Directory**: `frontend`
5. Set **Build Command**: `npm run build`
6. Set **Install Command**: `npm install`

### Environment Variables in Vercel:

Add these in Project → Settings → Environment Variables:

```
NEXT_PUBLIC_API_BASE_URL    = https://your-backend.railway.app/api/v1
NEXT_PUBLIC_POSTHOG_KEY     = phc_your_posthog_key (get from app.posthog.com)
NEXT_PUBLIC_POSTHOG_HOST    = https://app.posthog.com
```

7. Click Deploy

---

## 3. After deployment — verify these 7 things

Run each in your browser or Postman:

```
# 1. Backend health
GET https://your-backend.railway.app/health
→ Should return: {"status": "ok", "service": "evolvai-backend"}

# 2. Auth register
POST https://your-backend.railway.app/api/v1/auth/register
Body: {"email": "test@test.com", "password": "test12345"}
→ Should return 201 with user data

# 3. Auth login
POST https://your-backend.railway.app/api/v1/auth/login
Body: {"email": "test@test.com", "password": "test12345"}
→ Should return access_token

# 4. Create project (use token from step 3)
POST https://your-backend.railway.app/api/v1/projects
Headers: Authorization: Bearer <token>
Body: {"title": "Test Project", "description": "Testing", "startup_stage": "MVP"}
→ Should return 201 with project data

# 5. Dashboard
GET https://your-backend.railway.app/api/v1/dashboard/buildmind
Headers: Authorization: Bearer <token>
→ Should return execution_score, execution_streak etc

# 6. AI coach (requires GROQ_API_KEY to be set)
POST https://your-backend.railway.app/api/v1/ai/daily-action
Headers: Authorization: Bearer <token>
Body: {"projectId": <id from step 4>}
→ Should return action string

# 7. Frontend
Open https://your-app.vercel.app
→ Should redirect to /auth/login
→ Register, complete onboarding, see dashboard with your real data
```

---

## 4. PostHog verification

1. Go to app.posthog.com
2. Go to Live Events
3. Complete signup on your deployed frontend
4. You should see `user_signed_up` appear within 30 seconds

If you see events: PostHog is working ✓
If no events after 60 seconds: Check NEXT_PUBLIC_POSTHOG_KEY is correct in Vercel

---

## 5. Common issues

### "CORS error" in browser console
→ Set `FRONTEND_ORIGINS=https://your-app.vercel.app` in backend env vars. Redeploy backend.

### "401 Unauthorized" on all API calls
→ The JWT_SECRET in backend must be the same across all deployments. Don't change it after deploying.

### Projects page shows error
→ Most common cause: frontend is sending wrong field name. The fix is in this codebase. Title must be `title` (min 3 chars), not `project_name`.

### Onboarding doesn't complete
→ Fixed in this codebase. The `PATCH /auth/me` now sends `{ onboarding_completed: true }` correctly.

### PostHog shows no events
→ Check browser console for errors. Make sure NEXT_PUBLIC_POSTHOG_KEY starts with `phc_`.

---

## 6. Custom domain (optional)

1. Vercel → Project → Settings → Domains
2. Add your domain
3. Update FRONTEND_ORIGINS in backend to include your custom domain

---

## Files changed from your existing codebase

| File | What changed | Why |
|------|-------------|-----|
| `lib/api.ts` | Field names corrected | Backend expects `title` not `project_name` |
| `app/onboarding/page.tsx` | PATCH /auth/me corrected | Was missing `onboarding_completed: true` |
| `app/projects/page.tsx` | Create payload corrected | 422 error is now fixed |
| `app/dashboard/page.tsx` | Field mapping corrected | `execution_score` not `score` |
| `lib/analytics.ts` | PostHog integrated | Was not integrated at all |
| `app/providers.tsx` | PostHog init on every page | Page tracking now works |
| `app/layout.tsx` | PostHog provider added | Required for analytics to work |
| All pages | Design system | Consistent UI via `lib/design.tsx` |
| `public/logo.png` | Real PNG used | SVG replaced with your actual brand asset |
