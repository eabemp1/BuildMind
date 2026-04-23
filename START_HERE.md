# BuildMind — Run Locally in 3 Steps

No Docker needed. Just Node.js and your Supabase keys.

---

## What you need

- **Node.js 18+** — check with `node -v` (install from nodejs.org if needed)
- **A Supabase project** — free at supabase.com (you likely already have one)
- **A Groq API key** — free at console.groq.com/keys (takes 30 seconds)

---

## Step 1 — Install dependencies

```bash
npm install
```

---

## Step 2 — Set up your environment

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in **3 required values**:

```
NEXT_PUBLIC_SUPABASE_URL=      ← from Supabase → Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY= ← from Supabase → Settings → API
GROQ_API_KEY=                  ← from console.groq.com/keys
```

Everything else is optional for local testing. Payments won't process
locally without Paystack/Paddle keys, but all AI features and auth work.

If you've already deployed to Vercel, pull your keys directly:
```bash
npm install -g vercel
vercel env pull .env.local
```

---

## Step 3 — Run

```bash
npm run dev
```

Open **http://localhost:3000**

The full app runs: auth, AI coach, Break My Startup, onboarding,
weekly report, urgency signals, co-founder pulse — everything.

---

## Run the database migration (first time only)

The app expects a few Supabase tables (founder memory, push subscriptions, explore feed).
Run these SQL files once
in your Supabase SQL editor (supabase.com → your project → SQL Editor):

```
Copy and paste the contents of:
supabase/migrations/20260419201000_feed_events.sql
supabase/migrations/20260419202000_push_subscriptions.sql
supabase/migrations/20260419203000_founder_memory.sql
```

---

## Do you need the Python backend?

**Probably not.** All the core product features run through Next.js API
routes (`/app/api/ai/`). The Python backend handles some legacy analytics
endpoints but nothing you'll hit in normal testing.

If you do need it:
```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## Troubleshooting

**"GROQ_API_KEY is not set"** — Add it to `.env.local`, restart `npm run dev`

**Auth not working** — Check your Supabase URL and anon key. Make sure
`localhost:3000` is in your Supabase allowed redirect URLs:
Supabase → Authentication → URL Configuration → add `http://localhost:3000`

**AI features returning errors** — Your Groq key might be invalid or
rate-limited. Check console.groq.com for usage.

**Database errors** — Run the SQL migration above. Make sure your
`SUPABASE_SERVICE_ROLE_KEY` is set (needed for server-side DB access).
