/**
 * lib/urgency.ts — DEPRECATED SHIM
 *
 * This file has been split into focused modules under lib/urgency/:
 *   lib/urgency/types.ts      — UrgencyLevel, UrgencySignal
 *   lib/urgency/activeDate.ts — markActiveToday, syncUrgencyFromServer
 *   lib/urgency/taskDebt.ts   — recordPendingTasks
 *   lib/urgency/signal.ts     — computeUrgencySignal, getMissedDayCost
 *   lib/urgency/index.ts      — barrel re-export (use this for new imports)
 *
 * All existing imports still resolve through this file via the re-exports below.
 * New code should import from "@/lib/urgency" (resolves to lib/urgency/index.ts)
 * or from the specific sub-module.
 *
 * This shim will be removed once all import sites are updated.
 */

export type { UrgencyLevel, UrgencySignal } from "./urgency/types";
export { markActiveToday, syncUrgencyFromServer } from "./urgency/activeDate";
export { recordPendingTasks } from "./urgency/taskDebt";
export { computeUrgencySignal, getMissedDayCost } from "./urgency/signal";
export { recordScore } from "./scoring";
