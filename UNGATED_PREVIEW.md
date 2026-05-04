# Ungated Preview — How to unlock all features locally

To run BuildMind with builder-tier features unlocked (no billing check):

## Option 1 — Environment variable (fastest)

In your `.env.local`:
```
NEXT_PUBLIC_USER_PLAN=builder
```

## Option 2 — Browser console (per session)

```js
localStorage.setItem('bm_plan', 'builder');
location.reload();
```

## Option 3 — Dev helper (development mode only)

`bmSetPlan()` is exposed on `window` in dev:
```js
bmSetPlan('builder', 'your-user-id-here')
// then refresh
```

## Option 4 — Bypass billing/status API

Override `app/api/billing/status/route.ts` for local dev:
```ts
import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ ok: true, authenticated: true, plan: "builder" });
}
```

---

Active plan tiers: `free` | `builder`. The `normalizePlan()` function maps any
legacy tier string (operator, founder, chiefofstaff, venture) to `builder`.
