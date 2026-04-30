# Ungated Preview — How to unlock all features locally

To run BuildMind with all Ventures features unlocked (no auth, no billing check):

## Option 1 — Environment variable (fastest)

In your `.env.local`:
```
NEXT_PUBLIC_USER_PLAN=venture
```

This is read by `getPlan()` in `lib/plan.ts` when no localStorage value exists.

## Option 2 — Browser console (per session)

Open DevTools → Console and run:
```js
localStorage.setItem('bm_plan', 'venture');
location.reload();
```

## Option 3 — Dev helper (already wired)

In development mode, `bmSetPlan()` is exposed on `window`:
```js
bmSetPlan('venture', 'your-user-id-here')
// then refresh
```

## Option 4 — Bypass billing/status API

Create `app/api/billing/status/route.ts` override for local dev:
```ts
import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ ok: true, authenticated: true, plan: "venture" });
}
```
This makes `usePlan()` always resolve to Ventures without any Supabase call.

---

All 3 plan tiers are now real (Free / Builder / Ventures).
`normalizePlan('venture')` returns `'venture'` — no longer collapses to builder.
