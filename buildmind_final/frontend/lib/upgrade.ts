/**
 * lib/upgrade.ts — Upgrade trigger logic
 *
 * Call checkUpgradeTrigger() from the dashboard after each task completion.
 * This implements the "smart timing" paywall — shown AFTER the user has
 * felt the value, not immediately after signup.
 *
 * Triggers:
 * - User completes their 2nd task (feels momentum)
 * - OR user tries to use AI coach a 3rd time
 * - OR user has been active for 3+ days (streak signals retention)
 *
 * During beta: all gates disabled so testers can use freely.
 * Flip BETA_MODE to false when ready to charge.
 *
 * Usage in dashboard:
 *   import { recordTaskCompletion, checkUpgradeTrigger } from "@/lib/upgrade";
 *   import { useRouter } from "next/navigation";
 *
 *   const router = useRouter();
 *   recordTaskCompletion();
 *   const { shouldUpgrade, reason } = checkUpgradeTrigger(currentStreak);
 *   if (shouldUpgrade) {
 *     router.push(`/upgrade?tasks=${tasksDone}&streak=${currentStreak}`);
 *   }
 */

const BETA_MODE = true; // ← Set to false when ready to charge real users

const STORAGE_KEY = "bm_upgrade_shown";
const TASK_KEY = "bm_tasks_done";
const AI_USE_KEY = "bm_ai_uses";

export function recordTaskCompletion(): void {
  if (typeof window === "undefined") return;
  const current = Number(localStorage.getItem(TASK_KEY) ?? "0");
  localStorage.setItem(TASK_KEY, String(current + 1));
}

export function recordAIUse(): void {
  if (typeof window === "undefined") return;
  const current = Number(localStorage.getItem(AI_USE_KEY) ?? "0");
  localStorage.setItem(AI_USE_KEY, String(current + 1));
}

export function getTasksDone(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(TASK_KEY) ?? "0");
}

export function checkUpgradeTrigger(streak: number): { shouldUpgrade: boolean; reason: string } {
  if (BETA_MODE) return { shouldUpgrade: false, reason: "beta" };
  if (typeof window === "undefined") return { shouldUpgrade: false, reason: "ssr" };

  // Don't show again if already seen
  if (localStorage.getItem(STORAGE_KEY)) return { shouldUpgrade: false, reason: "already_shown" };

  const tasksDone = Number(localStorage.getItem(TASK_KEY) ?? "0");
  const aiUses = Number(localStorage.getItem(AI_USE_KEY) ?? "0");

  if (tasksDone >= 2) {
    localStorage.setItem(STORAGE_KEY, "1");
    return { shouldUpgrade: true, reason: "2_tasks_completed" };
  }

  if (aiUses >= 3) {
    localStorage.setItem(STORAGE_KEY, "1");
    return { shouldUpgrade: true, reason: "3_ai_uses" };
  }

  if (streak >= 3) {
    localStorage.setItem(STORAGE_KEY, "1");
    return { shouldUpgrade: true, reason: "3_day_streak" };
  }

  return { shouldUpgrade: false, reason: "not_yet" };
}

export function resetUpgradeTrigger(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(TASK_KEY);
  localStorage.removeItem(AI_USE_KEY);
}
