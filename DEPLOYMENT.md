# BuildMind v13 — Deployment Guide
**Last updated: April 2026**

---

## What's in this package

This is the complete, production-ready BuildMind frontend (v13). Drop it on top of your existing repo and deploy.

---

## What changed in v13

| Area | Change |
|------|--------|
| `lib/buildmind.ts` | **Split into focused modules** — now a thin re-export shim. All existing import paths unchanged. |
| `lib/buildmind.types.ts` | **NEW** — All domain types, importable server-side without pulling in the Supabase client. |
| `lib/stages/index.ts` | **NEW** — Stage inference logic (`inferStageFromMilestones`, `normalizeStage`, `stageRank`). |
| `lib/scoring/index.ts` | **NEW** — Score computation (`computeStartupScore`, `computeScoreDelta`, `applyScoreDelta`). One source of truth — used by both `today/page.tsx` and tests. |
| `lib/data/projects.ts` | **NEW** — All Supabase data access extracted. Bug fix: `getDashboardOverview` referenced an undefined `today` variable — now fixed. |
| `app/today/page.tsx` | Updated to v13 — `computeScoreAfter` now delegates to `lib/scoring` instead of duplicating logic. |
| `app/explore/page.tsx` | **Live data** — fetches from `feed_events` Supabase table on mount with graceful seed fallback. Shows `● live` indicator when real data loads. See SQL schema below. |
| `app/(dashboard)/dashboard/page.tsx` | Removed stale `ConsentLedgerCTA` import. |
| `__tests__/` | **NEW** — 57 passing tests covering scoring, stage inference, Paystack webhook, and Paddle verify. Zero test coverage → critical paths covered. |
| `vitest.config.ts` | **NEW** — Vitest config with path aliases and coverage. |
| `package.json` | Added `test`, `test:watch`, `test:coverage` scripts. Added `vitest` and `@vitest/coverage-v8` dev deps. |

---

## Vercel environment variables checklist

Set these in: **Vercel Dashboard → Your Project → Settings → Environment Variables**

### Required (app won't start without these)
```
NEXT_PUBLIC_SUPABASE_URL          = https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY     = eyJ...
SUPABASE_SERVICE_ROLE_KEY         = eyJ...   (server-side only — never NEXT_PUBLIC_)
```

### Required for payments
```
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY   = pk_live_...
PAYSTACK_SECRET_KEY               = sk_live_...       (webhook signature validation)

NEXT_PUBLIC_PADDLE_CLIENT_TOKEN   = pdl_live_...
PADDLE_API_KEY                    = pdl_live_...      (transaction verification)
NEXT_PUBLIC_PADDLE_PRICE_BUILDER  = pri_...
```

### Optional
```
GROQ_API_KEY                      = gsk_...           (AI routes — fallback logic works without it)
NEXT_PUBLIC_POSTHOG_KEY           = phc_...           (analytics)
NEXT_PUBLIC_USER_PLAN             = free              (default; overridden by billing webhooks)
NEXT_PUBLIC_API_URL               = https://your-backend.onrender.com
```

---

## Supabase: Founder Feed table (new in v13)

The Explore page now reads from a `feed_events` table. Run this SQL in your Supabase SQL editor:

```sql
create table feed_events (
  id          uuid primary key default gen_random_uuid(),
  flag        text not null,
  location    text not null,
  stage       text not null check (stage in ('Idea','Validation','MVP','Launch','Growth','Revenue')),
  stage_color text not null default '#6366f1',
  action      text not null,
  outcome     text,
  streak      int  not null default 0,
  type        text not null check (type in ('done','reflect','launched','streak','report')),
  created_at  timestamptz not null default now()
);

-- Enable RLS
alter table feed_events enable row level security;

-- Anon users can read (public feed)
create policy "public read"
  on feed_events for select
  using (true);

-- Only service role can insert (rows are written by API routes, not clients)
-- No INSERT policy needed for anon — use service role from server routes.
```

To seed the table with the curated examples, copy the `SEED` array from
`app/explore/page.tsx` and insert via the Supabase table editor.

**Feed events are written from the reflect-action API route.**
Add this to `app/api/ai/reflect-action/route.ts` after persisting the reflect entry:

```typescript
// Publish anonymised event to community feed
const supabaseAdmin = createAdminClient();
await supabaseAdmin.from("feed_events").insert({
  flag:        userFlag,        // from user profile (e.g. "🇬🇭")
  location:    userCity,        // from user profile (e.g. "Kumasi")
  stage:       stage,           // from project
  stage_color: stageColor,      // hex matching stage
  action:      todayAction,     // what they were asked to do today
  outcome:     note || null,    // their reflection note (optional)
  streak:      streak,          // current streak
  type:        outcomeToType(outcome), // "done" | "reflect" | etc.
});
```

---

## Running tests

```bash
npm test                  # run all tests once
npm run test:watch        # watch mode
npm run test:coverage     # with coverage report
```

Test files:
- `__tests__/lib/scoring.test.ts`    — 21 tests, pure functions, no mocking
- `__tests__/lib/stages.test.ts`     — 29 tests, pure functions, no mocking  
- `__tests__/billing/paystack-webhook.test.ts` — 14 tests, mocked Supabase
- `__tests__/billing/paddle-verify.test.ts`    — 14 tests, mocked Supabase + fetch

---

## lib/ module map (v13)

```
lib/
├── buildmind.ts          ← thin re-export shim (all imports still work)
├── buildmind.types.ts    ← domain types (NEW — no "use client" dependency)
├── stages/
│   └── index.ts          ← inferStageFromMilestones, normalizeStage, stageRank
├── scoring/
│   └── index.ts          ← computeStartupScore, computeScoreDelta, applyScoreDelta
├── data/
│   └── projects.ts       ← all Supabase project/milestone/task queries
├── billing/
│   └── server.ts         ← persistUserPlan, resolveUserIdByEmail (unchanged)
├── plan.ts               ← plan tier gating (unchanged)
├── api.ts                ← API helpers (unchanged)
├── notifications.ts      ← notification helpers (unchanged)
├── achievements.ts       ← achievement helpers (unchanged)
├── analytics.ts          ← PostHog wrapper (unchanged)
└── supabase/
    ├── client.ts
    ├── server.ts
    └── admin.ts
```

---

## Deployment steps

1. **Copy** all files from this package into your repo (overwrite existing)
2. **Set** environment variables in Vercel (see checklist above)
3. **Run** the `feed_events` SQL in Supabase
4. **Run** `npm test` locally to confirm all 57 tests pass
5. **Deploy** — `git push` to trigger Vercel build

---

## E2E tests (Playwright)

E2E tests live in `e2e/` and cover the flows that unit tests cannot reach: real browser redirects, session persistence, the Today core loop in a real DOM, and the billing verify sequence.

### Setup

```bash
npx playwright install chromium   # one-time browser download
```

Create a `.env.test` file (git-ignored) with a dedicated Supabase test account:

```
E2E_TEST_EMAIL=e2e@buildmind.test
E2E_TEST_PASSWORD=TestPass123!
PLAYWRIGHT_BASE_URL=http://localhost:3000
```

The test account must:
- Exist in your Supabase project
- Have `onboarding_completed = true` in the `users` table
- Have at least one project in the MVP stage

### Running

```bash
npm run test:e2e          # run all E2E tests (headless)
npm run test:e2e:ui       # interactive Playwright UI mode
npm run test:all          # unit tests + E2E in sequence
```

### Test files

| File | What's covered |
|------|----------------|
| `e2e/auth.spec.ts` | Login, redirect, session persistence, route protection |
| `e2e/today.spec.ts` | Action card, outcome chips, score delta, causality strip |
| `e2e/billing-paystack.spec.ts` | Paystack verify, Paddle verify, cancel flow |
| `e2e/explore.spec.ts` | Live/seed data loading, filters, outcome expand, live indicator |

The billing tests mock the verify API endpoints so they run without real payment credentials. Remove the mocks and set `PAYSTACK_TEST_PUBLIC_KEY` to run against the real Paystack test environment.

---

## Founder Feed: wiring the reflect-action insert

The `feed_events` insert is now live in `app/api/ai/reflect-action/route.ts`. It reads `flag` and `location` from `user_metadata` on the Supabase auth user. To populate these fields when a user signs up, add them during onboarding or via a geo-IP lookup:

```typescript
// In your onboarding completion handler:
const supabase = createAdminClient();
await supabase.auth.admin.updateUserById(userId, {
  user_metadata: {
    flag: "🇬🇭",      // user's country flag emoji
    city: "Accra",    // user's city
    country: "Ghana", // user's country name
  },
});
```

If `flag` / `city` are not set, the feed event falls back to `"🌍"` / `"Somewhere"` — the row still gets written, so the feed works from day one.
