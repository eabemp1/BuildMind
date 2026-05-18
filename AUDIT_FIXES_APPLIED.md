# BuildMind v4 — Audit Fixes Applied

> Based on the deep technical audit (May 2026). Every issue confirmed to
> exist in the codebase has been fixed in this release.

---

## Critical Fixes

### 1. `founder_memory` Schema / TypeScript Type Misalignment
**Audit finding:** The SQL `founder_memory` table had `personality_profile jsonb` and
`validation_receipts jsonb[]`, but the TypeScript `FounderMemory` type used
`personality_tags: string[]`, `avoidance_zones: string[]`, `strengths: string[]`,
`decision_patterns`, `emotional_signals`, `cofounder_style`, `last_insight`,
`insight_history`, `validationReceipts`, and `competitorHistory`. Every upsert
via the TypeScript type silently dropped data because those columns didn't exist.

**Files changed:**
- `supabase/schema-idempotent.sql` — `founder_memory` table rebuilt with all
  columns matching the TypeScript type
- `supabase/schema-minimal.sql` — same fix
- `supabase/schema-chunked.sql` — same fix
- `supabase/migrations/20260513_audit_fixes.sql` — **run this on your existing
  database** to add missing columns and migrate old `personality_profile` data
- `lib/founderMemory.ts` — added `validateFounderMemoryShape()` runtime validator
  called in `getFounderMemory()` to surface any future misalignments as console
  errors rather than silent data loss

**Action required:** Run the migration file against your Supabase project:
```bash
psql $DATABASE_URL < supabase/migrations/20260513_audit_fixes.sql
```

---

### 2. Cron Jobs Fetch All Push Subscriptions Without Pagination (OOM Risk)
**Audit finding:** Both `evening-check` and `push/send-daily` routes called
`.select("user_id, subscription")` on `push_subscriptions` with no `.range()` limit.
At 500+ users this loads all subscriptions into a single serverless function's
memory. Past ~5,000 users it causes silent OOM crashes with no error visible to
the founder.

**Files changed:**
- `app/api/cron/evening-check/route.ts` — replaced single fetch with a
  `while (hasMore)` loop fetching 100 rows at a time using `.range(from, to)`
- `app/api/push/send-daily/route.ts` — same paginated approach
- `app/api/cron/re-engage/route.ts` — same fix applied to the `founder_context`
  fetch (also unbounded)

**How it works now:**
```typescript
const PAGE_SIZE = 100;
let pageFrom = 0;
let hasMore = true;
while (hasMore) {
  const { data } = await supabase
    .from("push_subscriptions")
    .select("user_id, subscription")
    .range(pageFrom, pageFrom + PAGE_SIZE - 1);
  // ... process batch ...
  hasMore = data.length === PAGE_SIZE;
  pageFrom += PAGE_SIZE;
}
```

---

### 3. Billing Webhook Has No Idempotency Key
**Audit finding:** The Paystack webhook handler (`/api/billing/paystack/webhook`)
processed events without checking if they'd already been handled. If Paystack fired
`charge.success` twice (which it does during network retries), a user could be
upgraded twice. While Supabase RLS would likely prevent data corruption, it left
an unguarded window.

**Files changed:**
- `app/api/billing/paystack/webhook/route.ts` — before processing any event,
  inserts `{ provider, event_key, event_name }` into `processed_webhooks`. If the
  insert fails with `23505` (unique violation), the event was already handled and
  we return `200 { ignored: "duplicate_webhook" }` immediately.
- `supabase/schema-idempotent.sql` — added `processed_webhooks` table
- `supabase/schema-minimal.sql` — same
- `supabase/schema-chunked.sql` — same
- `supabase/migrations/20260513_audit_fixes.sql` — creates the table with a daily
  pg_cron cleanup of records older than 90 days

**Behaviour on duplicate webhook:**
```
POST /api/billing/paystack/webhook  (second delivery of same reference)
→ INSERT processed_webhooks (unique violation on reference)
→ return 200 { ok: true, ignored: "duplicate_webhook" }
← Paystack sees 200 and stops retrying
```

---

## Runtime Validation Added

### `lib/founderMemory.ts` — `validateFounderMemoryShape()`
Added a lightweight runtime validator that runs every time `getFounderMemory()`
fetches from Supabase. If the returned data shape doesn't match the TypeScript type
(e.g. after a partial migration or a schema drift), it logs a `console.error` with
the exact mismatched fields. This makes future schema misalignments immediately
visible in logs rather than silently corrupting AI context.

The validator checks:
- `personality_tags` — must be `string[]`
- `decision_patterns` — must be array
- `emotional_signals` — must be array
- `avoidance_zones` — must be `string[]`
- `strengths` — must be `string[]`
- `cofounder_style` — must be string if present
- `validation_receipts` — must be array
- `competitor_history` — must be array

---

## What Was Confirmed NOT an Issue

- **Coach history token overflow** — The coach route already caps history at
  `.slice(-8)` (last 8 messages) and slices each message content to 1000 chars.
  This is reasonable mitigation, though a proper sliding-window summary (audit
  recommendation #4) would be the full fix.

- **Paystack checkout double-return bug** — The audit notes this was "caught and
  fixed" in v4. Confirmed: `app/api/billing/checkout/route.ts` has correct
  branching.

- **Rate limiting on serverless** — Already migrated to Postgres atomic RPCs in
  `lib/server/rateLimit.ts`. Confirmed correct.

- **IDOR protection in `getRouteUser()`** — Already implemented in all protected
  routes. Confirmed.

- **CRON_SECRET validation** — Already implemented in all cron handlers. Confirmed.

---

## Remaining Known Issues (Not Fixed in This PR)

These are the audit recommendations that require more substantial work:

| # | Issue | Effort |
|---|-------|--------|
| 2 | Wire `/api/ai/today-action/stream` to Today page UI | 1–2 days |
| 3 | Extract monolithic page components (today, ventures, admin) | 3–5 days |
| 5 | Migrate primary state (XP, streak) from localStorage to Supabase | 2–3 days |
| 6 | Add circuit breaker to AI provider chain | 1 day |
| 8 | ARIA labels + keyboard navigation on Today page | 4 hours |
| 10 | End-to-end Playwright tests for Today page flow | 1–2 days |

The fixes in this file address the **three issues most likely to cause production
outages or data loss at any scale.** The remaining items are improvements that
become critical at 500–1,000+ users.

---

*BuildMind v4 Audit Fixes — Applied May 2026*

---

## v5 — Audit Report Recommendations (May 2026)

### REC 01 — Resend email provider
**Status: ALREADY IMPLEMENTED in v4**
`lib/email.ts` fully implements Resend. Requires `RESEND_API_KEY` in environment.

### REC 02 — 7-day free trial + hard paywall on day 8
**Status: IMPLEMENTED ✓**
- `supabase/migrations/20260514000001_free_trial.sql` — adds `trial_started_at`, `trial_ends_at`, `trial_expired` to `founder_context`
- `lib/plan.ts` — `startFreeTrial()`, `getTrialStatus()`, `isTrialActive()`, `getEffectivePlan()`, `markTrialExpired()`
- `app/api/billing/start-trial/route.ts` — POST endpoint to initialise trial server-side
- `app/api/billing/status/route.ts` — now returns `trial: { active, expired, daysRemaining, endsAt, durationDays }` and enforces hard paywall on expiry
- `app/auth/callback/route.ts` — starts trial automatically on first sign-in
- `components/TrialBanner.tsx` — `<TrialBanner daysRemaining={N} />` (dismissible, urgent styling on day 6–7)
- `components/TrialBanner.tsx` — `<TrialPaywall expired={true} />` (hard block, not dismissible)
- `components/layout/app-shell.tsx` — trial banner + paywall wired into the app shell
- `lib/usePlan.ts` — `usePlan()` now returns `trialActive`, `trialExpired`, `trialDaysRemaining`

### REC 03 — Pre-check-in paywall on today page load
**Status: IMPLEMENTED ✓**
Previously `PaywallMoment` with `trigger="morning_briefing"` only appeared in the post-check-in state (after the user had already extracted value for free).
Now it also renders on page load — before check-in — when `plan === "free" && briefingAvailable`.
This is the highest-intent conversion moment: the founder opens the app, sees the briefing exists, can't read it fully, and upgrades before they check in.
File: `app/today/page.tsx`

### REC 04 — Fix `recent_task_titles` never passed to `detectPattern`
**Status: ALREADY FIXED in v4**
Both `app/api/cron/evening-check/route.ts` and `app/api/founder-context/task-complete/route.ts` fetch the last 14 days of task titles and pass them as `recent_task_titles` to `detectPattern()`.

### REC 05 — Truncate `last_insight` in coach proactive observation
**Status: ALREADY FIXED in v4**
`app/api/ai/coach/route.ts` `buildProactiveObservation()` now truncates to the first sentence (≤120 chars) before injecting into the prompt.
