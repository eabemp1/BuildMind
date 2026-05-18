/**
 * lib/urgency/taskDebt.ts — Task debt tracking
 *
 * Extracted from lib/urgency.ts monolith.
 * Responsible for: recordPendingTasks, getTaskDebt.
 * No dependency on streak or decay logic.
 */

import { storage } from "@/lib/storage";
import { getLastActiveDate, todayStr } from "./activeDate";

export const TASK_DEBT_KEY = "bm_task_debt";

export function recordPendingTasks(count: number): void {
  if (typeof globalThis.window === "undefined") return;
  const last = getLastActiveDate();
  if (last && last !== todayStr()) {
    storage.set(TASK_DEBT_KEY, String(count));
  }
}

export function getTaskDebt(): number {
  if (typeof globalThis.window === "undefined") return 0;
  return Number(storage.get(TASK_DEBT_KEY) ?? "0");
}
