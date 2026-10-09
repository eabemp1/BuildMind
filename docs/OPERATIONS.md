# BuildMind operations runbook

One page for the person on call (today, that is you).

## Monitors to set up (free tiers are enough)

Use UptimeRobot or BetterStack. Alert by email and by push to your phone.

| Monitor | URL | Interval | Alert when |
|---|---|---|---|
| App is up | `https://buildmind.live/api/health` | 1 min | Not 200 for 2 checks |
| Daily push ran | `https://buildmind.live/api/push/health` | 30 min | `status` is not `ok` (keyword monitor on `"status":"ok"`) |
| Landing page | `https://buildmind.live/` | 5 min | Not 200 |

`/api/push/health` answers with a redacted view without the cron secret, which is
enough for a keyword monitor. Send `Authorization: Bearer $CRON_SECRET` to see
the last run time, sent count and subscriber count.

The push cron writes one row to `push_cron_log` per run. If you see
`"No cron run recorded yet"`, apply `supabase/migrations/20261008000000_push_cron_log.sql`.

## Scheduled jobs (vercel.json)

| Job | Schedule (UTC) | What a failure looks like |
|---|---|---|
| `/api/morning-briefing` | 05:00 daily | No 7am briefing |
| `/api/push/send-daily` | 07:00 daily | `/api/push/health` goes `degraded` after 26h |
| `/api/cron/weekly-report` | Fri 07:00 | No weekly report email |
| `/api/billing/reconcile` | 08:00 daily | Paid users stuck on Free (check first) |
| `/api/cron/evening-check` | 18:00 daily | No evening nudge |
| `/api/cron/re-engage` | 09:00 daily | No win-back emails |
| `/api/cron/aggregate-benchmarks` | 02:00 daily | Stale benchmarks |

Vercel > Project > Logs > filter by the path to see a run. A cron returns 401
when `CRON_SECRET` is missing or wrong in the environment.

## Sentry alerts

Create three alert rules on the project:

1. Any new issue in production, notify email.
2. More than 10 events in 5 minutes on one issue, notify email and phone.
3. Any event whose transaction starts with `/api/billing`, notify immediately.

## When something breaks

1. **Users cannot reach the app.** Check Vercel status and the last deploy. Roll back from the Deployments tab (Promote the previous build).
2. **Today shows "Intelligence temporarily unavailable" for everyone.** Check the AI provider status and quota (Groq / Cerebras / Gemini). `/api/health` shows whether a provider key is configured.
3. **A paid user is on the Free plan.** Run the billing reconcile job by hand (`GET /api/billing/reconcile` with the cron secret), then check `paystack_events` for the payment.
4. **Push notifications stopped.** Open `/api/push/health` with the secret. If `lastRun` is old, run `/api/push/send-daily` by hand and read the Vercel log.

## Before every release

CI must be green (typecheck + 1,380+ unit tests). For anything touching Today,
Progress or billing, also run `npm run test:e2e` against a staging project.
