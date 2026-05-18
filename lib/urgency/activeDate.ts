/**
 * lib/urgency/activeDate.ts — Active date tracking and server sync
 *
 * Extracted from lib/urgency.ts monolith.
 * Responsible for: markActiveToday, syncUrgencyFromServer, getLastActiveDate.
 * Has no dependency on streak or decay logic.
 */

import { storage } from "@/lib/storage";

export const LAST_ACTIVE_KEY = "bm_last_active_date";
export const STREAK_KEY = "bm_streak";

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export function getLastActiveDate(): string | null {
  if (typeof globalThis.window === "undefined") return null;
  return storage.get(LAST_ACTIVE_KEY);
}

export function markActiveToday(): void {
  if (typeof globalThis.window === "undefined") return;
  const today = todayStr();
  storage.set(LAST_ACTIVE_KEY, today);

  // Persist to Supabase — fire-and-forget so UI is instant
  fetch("/api/user/score-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: today }),
  }).catch(() => { /* non-fatal */ });
}

/**
 * syncUrgencyFromServer — seeds streak + lastActive from Supabase on app mount.
 * Server wins for streak; last_checkin_date maps to lastActive.
 * Does not overwrite a locally-updated streak ahead of the server.
 */
export async function syncUrgencyFromServer(): Promise<void> {
  if (typeof globalThis.window === "undefined") return;
  try {
    const res = await fetch("/api/founder-context/streak");
    if (!res.ok) return;
    const { streak, lastCheckinDate } = await res.json() as {
      streak?: number;
      lastCheckinDate?: string | null;
    };

    if (typeof streak === "number") {
      const local = Number(storage.get(STREAK_KEY) ?? "0");
      if (streak >= local) storage.set(STREAK_KEY, String(streak));
    }

    if (typeof lastCheckinDate === "string" && lastCheckinDate) {
      const localActive = storage.get(LAST_ACTIVE_KEY);
      if (!localActive || lastCheckinDate >= localActive) {
        storage.set(LAST_ACTIVE_KEY, lastCheckinDate);
      }
    }
  } catch { /* non-fatal — localStorage copy is the fallback */ }
}
