/**
 * lib/urgency/index.ts — Public API barrel
 *
 * Re-exports everything that was previously in lib/urgency.ts so all existing
 * import sites continue to work without modification:
 *
 *   import { computeUrgencySignal } from "@/lib/urgency"   ← still works
 *   import { syncUrgencyFromServer } from "@/lib/urgency"  ← still works
 *
 * Internal code should import from the focused sub-modules directly:
 *   import { computeUrgencySignal } from "@/lib/urgency/signal"
 *   import { syncUrgencyFromServer } from "@/lib/urgency/activeDate"
 *   import { recordPendingTasks }   from "@/lib/urgency/taskDebt"
 *
 * Module responsibilities:
 *   types.ts      — UrgencyLevel, UrgencySignal (no deps)
 *   activeDate.ts — markActiveToday, syncUrgencyFromServer, getLastActiveDate
 *   taskDebt.ts   — recordPendingTasks, getTaskDebt
 *   signal.ts     — computeUrgencySignal, getMissedDayCost (reads above two)
 */

export type { UrgencyLevel, UrgencySignal } from "./types";
export { markActiveToday, syncUrgencyFromServer } from "./activeDate";
export { recordPendingTasks } from "./taskDebt";
export { computeUrgencySignal, getMissedDayCost } from "./signal";

// recordScore is owned by lib/scoring — re-exported here for the one call site
// (overview/page.tsx) that imports it via urgency. Keep this so that page
// doesn't need a separate import change.
export { recordScore } from "@/lib/scoring";
