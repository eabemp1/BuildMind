/**
 * lib/upgrade.ts — backward-compat re-export
 *
 * All logic has moved to lib/plan.ts.
 * This file keeps old imports working without any changes.
 * Do not add new logic here — add it to plan.ts.
 */
export {
  recordTaskCompletion,
  incrementDailyStreak,
  getStoredStreak,
  recordAIMessage as recordAIUse,
  getTasksDone,
  checkUpgradeTrigger,
  resetUpgradeTrigger,
} from "@/lib/plan";
