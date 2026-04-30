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
  try {
    return JSON.parse(
      localStorage.getItem(WORK_WINDOW_KEY) ??
      JSON.stringify({ startHour: 9, endHour: 18, timezone: "Africa/Accra" })
    );
  } catch {
    return { startHour: 9, endHour: 18, timezone: "Africa/Accra" };
  }
}

export function setWorkWindow(window: WorkWindow): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WORK_WINDOW_KEY, JSON.stringify(window));
}

export function setLastDeclaredGoal(goal: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_GOAL_KEY, goal);
}

export function getLastDeclaredGoal(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_GOAL_KEY);
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
  if (localStorage.getItem(IDLE_ALERTED_KEY) === todayKey) {
    return { isIdle: false, hoursIdle: 0 };
  }

  // Read last active timestamp — same key used by urgency.ts
  const lastActiveRaw = localStorage.getItem("bm_last_active_date");
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

  // Mark alerted so we don't repeat
  localStorage.setItem(IDLE_ALERTED_KEY, todayKey);

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
  localStorage.setItem("bm_last_active_date", new Date().toISOString());
}
