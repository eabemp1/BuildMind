# Coach Actions

The AI Coach can now *do* things, not only talk. Phase 1 is read-only and
fully deterministic (zero AI tokens):

| Action | Trigger examples | Result |
| --- | --- | --- |
| `list_backlog` | chip "Show my open tasks"; "what's in my backlog", "show my open tasks on the pricing milestone", "list all my tasks", "show top 5 open tasks" | Stats + task rows + JSON/CSV downloads (`/api/founder-context/backlog-export`) |
| `export_intelligence` | chip "Export my intelligence data"; "export my data as csv", "give me my execution record in json" | Links to the existing `/api/founder-context/intelligence-export` (JSON, CSV trend, 30-day history) |

## How a request flows

1. `app/api/ai/coach/route.ts` — after auth, **before** the free-plan message cap
   (actions cost no tokens, so they don't spend the daily allowance):
   chip → `body.action`; typed text → `matchCoachAction()`. Spiral-flagged
   messages never match. A typed match that errors falls through to normal
   coaching; an explicit chip request returns its error.
2. `lib/coachActions/registry.ts::runCoachAction` — closed set of actions, each
   with a zod params schema and a plan tier. `userId`/`projectId` come only from
   the session + an ownership check; no schema has a field for either.
3. The result is data (`CoachActionResult`), rendered by
   `components/coach/CoachActionResultCard.tsx`. Never model-written prose.

## Adding an action

1. Add the id to `CoachActionId` (`types.ts`).
2. `defineAction({...})` in `registry.ts` and add it to `COACH_ACTIONS`.
3. Reuse an existing single-source function (`loadFounderIntelligence`,
   `getFounderScorecard`, `/api/founder-context/patterns`, …) — do not
   re-derive numbers inside a handler.
4. Optional: a phrase in `matcher.ts` and a chip in `chips.ts`.
5. Tests in `__tests__/lib/coachActions.test.ts` (the wiring tests fail if a
   chip or matcher output isn't accepted by its action's schema).

Rules that hold for every action: params are untrusted; check `error` on every
query (a bad column makes supabase-js resolve with `error`, not throw); read-only
until writes can be built as propose → confirm → awaited server execution.

## Where a stronger model plugs in later

`matchCoachAction` is stage one: high-precision, model-free, works when every
provider is down. A stronger model becomes a stage-two router for phrasing the
matcher can't catch — it returns the same `{ id, params }` and goes through the
same `runCoachAction`, so nothing downstream changes. Keep that router prompt
tiny (action catalog + the message; not the full coach context) so it doesn't
compete with Today for the shared token-per-minute ceiling.

## Switches / open product decisions

- `COACH_ACTIONS_DISABLED=true` turns the whole feature off (chips then error;
  typed text just reaches the coach as before).
- Both actions are `minPlan: "free"` and don't count toward the 3/day free
  coaching cap. Both are one-line changes in `registry.ts` / the route if you
  decide otherwise.
