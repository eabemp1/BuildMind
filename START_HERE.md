# BuildMind — Run Locally in 3 Steps

No Docker needed. Just Node.js and your Supabase keys.

---

## What you need

- **Node.js 18+** — check with `node -v`
- **A Supabase project** — free at supabase.com
- **A Groq API key** — free at console.groq.com/keys

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

Open `.env.local` and fill in **4 required values**:

```
NEXT_PUBLIC_SUPABASE_URL=      ← from Supabase → Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY= ← from Supabase → Settings → API
SUPABASE_SERVICE_ROLE_KEY=     ← from Supabase → Settings → API
GROQ_API_KEY=                  ← from console.groq.com/keys
```

Payments won't process locally without Paystack keys, but all AI features and auth work.

If you've already deployed to Vercel:
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

---

## Database migrations (first time only)

Run these SQL files in order in your Supabase SQL editor:

1. `supabase/migrations/20260419203000_founder_memory.sql`
2. `supabase/migrations/20260425000000_cofounder_core_and_ventures.sql`
3. `supabase/migrations/20260426000000_founder_context_and_momentum.sql`
4. `supabase/migrations/20260429000000_admin_role.sql`
5. `supabase/migrations/20260430000000_align_app_schema.sql`
6. `supabase/migrations/20260502000000_agentic_upgrades.sql`

For a fresh database, `supabase/schema-idempotent.sql` applies everything in one shot.

---

## Troubleshooting

**"GROQ_API_KEY is not set"** — Add it to `.env.local`, restart `npm run dev`

**Auth not working** — Check your Supabase URL and anon key. Add `http://localhost:3000`
to Supabase → Authentication → URL Configuration → Redirect URLs.

**AI features returning errors** — Check console.groq.com for usage/rate limits.

**Database errors** — Run migrations in order above. Make sure `SUPABASE_SERVICE_ROLE_KEY`
is set (needed for server-side DB access).
