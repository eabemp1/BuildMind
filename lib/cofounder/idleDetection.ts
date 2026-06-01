/**
 * lib/cofounder/idleDetection.ts
 *
 * CoFounder Core — Module 3B: Idle Detection
 *
 * Monitors activity during a founder's declared work window.
 * If no BuildMind activity is recorded past a configurable threshold,
 * the co-founder surfaces a contextual message referencing their last
 * specific goal — not a generic push notification.
 *
 * Reads bm_last_active_date from lib/urgency.ts (no changes to urgency.ts needed).
 * Builder plan only.
 */

import { getLimits } from "@/lib/plan";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkWindow {
  startHour: number; // 0-23
  endHour: number;   // 0-23
  timezone: string;  // IANA timezone string, e.g. "Africa/Accra"
}

export interface IdleCheckResult {
  isIdle: boolean;
  hoursIdle: number;
  lastGoal?: string;
  cofounderMessage?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const IDLE_THRESHOLD_HOURS = 3; // alert after 3 hours of inactivity during work window
const WORK_WINDOW_KEY = "bm_work_window";
const LAST_GOAL_KEY = "bm_last_declared_goal";
const IDLE_ALERTED_KEY = "bm_idle_alerted_date"; // prevent repeat alerts same day

// ─── Work window management ───────────────────────────────────────────────────

export function getWorkWindow(): WorkWindow {
  if (typeof window === "undefined") {
    return { startHour: 9, endHour: 18, timezone: "Africa/Accra" };
  }
  return storage.getJSON<WorkWindow>(WORK_WINDOW_KEY, { startHour: 9, endHour: 18, timezone: "Africa/Accra" });
}

export async function syncIdleDetectionStateFromServer(): Promise<void> {
  if (typeof window === "undefined") return;
  const values = await fetchBehaviorState<{
    work_window: WorkWindow;
    last_declared_goal: string;
    idle_alerted_date: string;
  }>(["work_window", "last_declared_goal", "idle_alerted_date"]);
  if (values.work_window && typeof values.work_window === "object") {
    storage.setJSON(WORK_WINDOW_KEY, values.work_window);
  }
  if (typeof values.last_declared_goal === "string") {
    storage.set(LAST_GOAL_KEY, values.last_declared_goal);
  }
  if (typeof values.idle_alerted_date === "string") {
    storage.set(IDLE_ALERTED_KEY, values.idle_alerted_date);
  }
}

export function setWorkWindow(w: WorkWindow): void {
  if (typeof w === "undefined") return;
  storage.setJSON(WORK_WINDOW_KEY, w);
  persistBehaviorState({ work_window: w });
}

export function setLastDeclaredGoal(goal: string): void {
  if (typeof window === "undefined") return;
  storage.set(LAST_GOAL_KEY, goal);
  persistBehaviorState({ last_declared_goal: goal });
}

export function getLastDeclaredGoal(): string | null {
  if (typeof window === "undefined") return null;
  return storage.get(LAST_GOAL_KEY);
}

// ─── Idle check ───────────────────────────────────────────────────────────────

/**
 * Checks if the founder is idle during their declared work window.
 * Reads last active date from urgency.ts key convention (bm_last_active_date).
 * Returns a co-founder message if idle past threshold.
 *
 * Builder plan only — free plan receives no idle detection.
 */
export function checkIdleStatus(): IdleCheckResult {
  const limits = getLimits();
  if (!limits.unlimitedAITasks) {
    return { isIdle: false, hoursIdle: 0 };
  }

  if (typeof window === "undefined") return { isIdle: false, hoursIdle: 0 };

  const workWindow = getWorkWindow();
  const now = new Date();
  const currentHour = now.getHours();

  // Only check during work window
  if (currentHour < workWindow.startHour || currentHour >= workWindow.endHour) {
    return { isIdle: false, hoursIdle: 0 };
  }

  // Check if we already alerted today
  const todayKey = now.toISOString().slice(0, 10);
  if (storage.get(IDLE_ALERTED_KEY) === todayKey) {
    return { isIdle: false, hoursIdle: 0 };
  }

  const lastActiveRaw = storage.get("bm_last_active_date");
  if (!lastActiveRaw) return { isIdle: false, hoursIdle: 0 };

  const lastActive = new Date(lastActiveRaw);
  const hoursIdle = (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60);

  if (hoursIdle < IDLE_THRESHOLD_HOURS) {
    return { isIdle: false, hoursIdle };
  }

  // Compose contextual co-founder message
  const lastGoal = getLastDeclaredGoal();
  const hoursStr = Math.floor(hoursIdle);

  const cofounderMessage = lastGoal
    ? `You said you were building the ${lastGoal} today. It's been ${hoursStr} hours. Is something blocking you or did something happen? Reply here.`
    : `It's been ${hoursStr} hours since you last touched BuildMind and you're in your work window. Still building today?`;

  storage.set(IDLE_ALERTED_KEY, todayKey);
  persistBehaviorState({ idle_alerted_date: todayKey });

  return {
    isIdle: true,
    hoursIdle,
    lastGoal: lastGoal ?? undefined,
    cofounderMessage,
  };
}

/**
 * Records current timestamp as last active.
 * Should be called on any meaningful BuildMind interaction.
 * Mirrors the key convention from lib/urgency.ts.
 */
export function recordActivity(): void {
  if (typeof window === "undefined") return;
  storage.set("bm_last_active_date", new Date().toISOString());
}
