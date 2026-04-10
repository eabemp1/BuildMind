# BuildMind v2 — Deployment Guide
**Last updated: April 2026**

---

## What's in this package

This is the complete, production-ready BuildMind frontend. It includes every file changed or added across all build sessions. Drop it on top of your existing repo and deploy.

---

## Files changed from the original

| File | What changed |
|------|-------------|
| `lib/plan.ts` | **NEW** — Full plan gating (Free/Builder/Venture), weekly action tracking, daily AI limits, smart upgrade triggers. Single source of truth for all monetization logic. |
| `lib/upgrade.ts` | Now a clean re-export shim from `plan.ts`. All old imports (`recordTaskCompletion`, `checkUpgradeTrigger`, etc.) keep working with zero changes. |
| `lib/ventures.ts` | **NEW** — ConsentLedger added as active venture (Month 1–3) with 12 milestones across 3 phases. SafeRemit moved to Month 4–6. Full revenue models, research papers, enforcement requirements for both. |
| `components/ConsentLedgerCTA.tsx` | **NEW** — 4-variant cross-promotion component. Drop anywhere in the app. |
| `components/layout/sidebar.tsx` | Ventures always visible to all users (free users see cards, gate is on detail view). NEW badge. ConsentLedger cross-link. Dynamic plan chip. |
| `app/today/page.tsx` | 7 retention fixes: localStorage persistence for done state, streak broken warning, next action preview, build-in-public share button, venture track progress widget, ConsentLedgerCTA in done state, better upgrade trigger timing. |
| `app/ventures/page.tsx` | **NEW PAGE** — Venture roadmap viewer. Free users see all cards (value visible). Upgrade gate on milestone detail view only. localStorage persistence for milestone completion. |
| `app/(dashboard)/dashboard/page.tsx` | ConsentLedgerCTA (`variant="full"`) added at bottom. |
| `app/(dashboard)/settings/page.tsx` | **Billing tab added** — 4-step cancellation prevention flow: streak/progress display → 30-day pause offer → cancellation reason collection → confirmed state with context-aware recovery message. |
| `app/landing/page.tsx` | Improved landing page with ConsentLedger mention. |
| `app/upgrade/page.tsx` | Improved upgrade page with plan comparison. |
| `app/reports/page.tsx` | Improved reports page. |
| `middleware.ts` | Ventures route added to public routes (so unauthenticated users can preview venture cards). |

---

## Vercel environment variables checklist

Set these in: Vercel Dashboard → Your Project → Settings → Environment Variables

### Required (app won't start without these)
```
NEXT_PUBLIC_SUPABASE_URL          = https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY     = eyJ...
SUPABASE_SERVICE_ROLE_KEY         = eyJ...   (server-side only, never NEXT_PUBLIC_)
```

### Required for payments
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_...
STRIPE_SECRET_KEY                  = sk_live_...
STRIPE_WEBHOOK_SECRET              = whsec_...
```

When a user pays via Stripe, your webhook must set their Supabase user metadata:
```json
{ "plan": "builder" }   // or "venture"
```
Then `getPlan()` in `lib/plan.ts` reads `NEXT_PUBLIC_USER_PLAN` from the user session.

### Optional but recommended
```
NEXT_PUBLIC_USER_PLAN             = free   (default if unset; overridden by Stripe webhook)
NEXT_PUBLIC_API_URL               = https://your-backend.onrender.com
```

### Dev-only overrides (never commit to production)
```
# In your browser console only:
window.setPlan('builder')   # test Builder features
window.setPlan('venture')   # test Venture features  
window.clearPlan()          # reset to free
```

---

## How to apply to your repo

```bash
# 1. Copy all changed files (safe — won't touch your backend)
cp -r frontend/lib/* your-repo/frontend/lib/
cp -r frontend/components/* your-repo/frontend/components/
cp -r frontend/app/* your-repo/frontend/app/
cp frontend/middleware.ts your-repo/frontend/middleware.ts

# 2. Install no new dependencies — everything uses what's already in package.json

# 3. Deploy
git add -A
git commit -m "feat: BuildMind v2 — plan gating, ventures, anti-churn, ConsentLedger cross-promo"
git push
```

Vercel auto-deploys on push. Build time is ~45 seconds.

---

## Stripe webhook setup (5 minutes)

1. Go to Stripe Dashboard → Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://your-domain.com/api/webhooks/stripe`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
4. Copy the webhook secret → paste as `STRIPE_WEBHOOK_SECRET` in Vercel

In your webhook handler, on `checkout.session.completed`:
```typescript
// Set user plan in Supabase
await supabase.auth.admin.updateUserById(userId, {
  user_metadata: { plan: "builder" }  // or "venture"
});
```

On `customer.subscription.deleted`:
```typescript
await supabase.auth.admin.updateUserById(userId, {
  user_metadata: { plan: "free" }
});
```

---

## ConsentLedger integration

The `ConsentLedgerCTA` component is already placed in:
- `app/(dashboard)/dashboard/page.tsx` — `variant="full"` (bottom of dashboard)
- `app/today/page.tsx` — `variant="compact"` (below action card) and `variant="done-state"` (after completion)
- `app/ventures/page.tsx` — `variant="compact"` (after venture card list)

To update the CTA URL, edit one line in `components/ConsentLedgerCTA.tsx`:
```typescript
const CL_URL = "https://consentledger.io";  // ← update this
```

---

## Supabase tables required

These tables must exist (created by your existing migrations):

```sql
users          (id, full_name, notify_milestone, notify_task)
projects       (id, user_id, title, description, startup_stage, ...)
ai_usage       (user_id, month, count)
milestones     (id, project_id, title, completed, ...)
```

No new migrations needed for this release.

---

## Cancellation prevention — how it works

When a paid user clicks "Cancel plan" in Settings → Billing:

1. **Confirm step** — Shows their streak count and tasks completed. Visual loss framing. Two options: "Continue cancelling" or "Keep my plan".

2. **Pause offer** — Offers 30-day pause (no charge, streak preserved, free once/year). Side-by-side comparison: pause vs cancel. Most users stop here.

3. **Reason collection** — 6-option multiple choice. Required before confirming. Every reason goes to your analytics.

4. **Final state** — Context-aware message. "Too expensive" → tells them about upcoming lower tier. "Missing feature" → tells them replies go to the founder.

The pause is currently UI-only — wire it to Stripe's subscription pause API when ready:
```typescript
// Stripe pause subscription
await stripe.subscriptions.update(subscriptionId, {
  pause_collection: { behavior: "void" },
});
```

---

## What to do next (in order)

1. **Deploy this** — push to Vercel, confirm it builds clean
2. **Wire Stripe webhook** — set `STRIPE_WEBHOOK_SECRET`, test with Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
3. **Set ConsentLedger URL** — update `CL_URL` in `ConsentLedgerCTA.tsx` to your live URL
4. **Wire Stripe pause API** — connect the pause button in Settings → Billing to `stripe.subscriptions.update`
5. **Add ventures route to sidebar** for authenticated users (currently accessible at `/ventures` directly)
6. **ConsentLedger → BuildMind funnel** — add a "Built using BuildMind" link/badge on the ConsentLedger site

---

## Known issues / watch out for

- `lib/upgrade.ts` re-exports `recordAIMessage` as `recordAIUse` for backward compat — if you add new AI tracking, add it to `plan.ts` only
- The pause flow in Settings is UI-only until you connect the Stripe API
- `NEXT_PUBLIC_USER_PLAN` is read client-side — for production, always set it via Stripe webhook + Supabase metadata, not as a static env var
- Venture milestone completion is stored in localStorage (per device) — for cross-device sync, wire it to a Supabase `venture_progress` table

---

*BuildMind v2 — built for execution, not inspiration.*
