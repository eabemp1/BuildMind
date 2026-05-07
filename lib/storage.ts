/**
 * lib/storage.ts — User-scoped localStorage wrapper
 *
 * THE PROBLEM:
 *   localStorage is per-origin (domain), NOT per-account. When User A logs
 *   out and User B logs in on the same device/browser, User B reads User A's
 *   streak, today's action, coach memory, reflect history, AI usage counts,
 *   and plan tier — because they all share the same unscoped keys like
 *   "bm_streak", "bm_today_action_cache", "bm_coach_memory", etc.
 *
 * THE FIX:
 *   This module is a drop-in replacement for raw localStorage calls.
 *   Every key is automatically namespaced with the current user's ID:
 *     "bm_streak"  →  "bm_u:<userId>:bm_streak"
 *
 *   On sign-in:  call storage.onSignIn(userId)  — loads the correct namespace
 *   On sign-out: call storage.onSignOut()        — clears the active namespace
 *                                                  and wipes old keys
 *
 * USAGE:
 *   import { storage } from "@/lib/storage";
 *
 *   // Instead of:    localStorage.getItem("bm_streak")
 *   storage.get("bm_streak")
 *
 *   // Instead of:    localStorage.setItem("bm_streak", "5")
 *   storage.set("bm_streak", "5")
 *
 *   // Instead of:    localStorage.removeItem("bm_streak")
 *   storage.remove("bm_streak")
 *
 *   // JSON helpers:
 *   storage.getJSON<T>("bm_reflect_history", [])
 *   storage.setJSON("bm_reflect_history", [...])
 *
 * SAFE KEYS (global, NOT user-scoped):
 *   bm_theme, bm_ref_code, bm_cl_waitlist, bm_dev_auth, bm_dev_email
 *   These are intentionally not user-scoped (theme preference is per-device).
 */

// Keys that are intentionally global (not user-scoped)
const GLOBAL_KEYS = new Set([
  "bm_theme",
  "bm_ref_code",
  "bm_cl_waitlist",
  "bm_dev_auth",
  "bm_dev_email",
  "bm_dev_project",
  "bm_first_seen",
  "bm_pwa_prompted",
]);

// User-data keys that MUST be cleared on sign-out / scoped per user
const USER_DATA_KEYS = [
  "bm_streak",
  "bm_last_checkin_date",
  "bm_achievement_stats",
  "bm_reflect_pending",
  "bm_reflect_history",
  "bm_today_action",
  "bm_today_action_cache",
  "bm_today_done_date",
  "bm_checkin_done_date",
  "bm_coach_memory",
  "bm_coach_streak_date",
  "bm_break_streak_date",
  "bm_ai_personality",
  "bm_cognitive_load",
  "bm_my_ventures_done",
  "bm_startup_kit_idea",
  "bm_startup_kit_result",
  "bm_blueprint_to_7day",
  "bm_stress_test_idea",
  "bm_last_active_date",
  "bm_tasks_done",
  "bm_plan",
  "bm_upgrade_shown",
  "bm_push_prompt_shown",
  "bm_domain",
  "bm_idea",
];

// Prefix format: "bm_u:<userId>:"
function scopedKey(userId: string, key: string): string {
  return `bm_u:${userId}:${key}`;
}

// Week/day key helpers (same format as plan.ts)
function aiDayKey(userId: string): string {
  const d = new Date();
  return scopedKey(userId, `bm_ai_${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
}
function weekKey(): string {
  const d = new Date();
  const j = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}_w${Math.ceil(((d.getTime() - j.getTime()) / 86400000 + j.getDay() + 1) / 7)}`;
}
function coachWeekKey(): string {
  const d = new Date();
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

class UserScopedStorage {
  private _userId: string | null = null;

  /** Call immediately after Supabase auth.getUser() resolves with a user */
  onSignIn(userId: string): void {
    if (typeof window === "undefined") return;
    const prev = localStorage.getItem("bm_active_user_id");
    if (prev && prev !== userId) {
      // Different user signed in on this device — wipe their unscoped legacy keys
      // but keep their scoped data (it's already under bm_u:<prevUserId>:*)
      this._wipeLegacyUnscopedKeys();
    }
    this._userId = userId;
    localStorage.setItem("bm_active_user_id", userId);
  }

  /** Call on sign-out — clears unscoped legacy keys, keeps scoped data */
  onSignOut(): void {
    if (typeof window === "undefined") return;
    this._wipeLegacyUnscopedKeys();
    // Also clear the active user marker
    localStorage.removeItem("bm_active_user_id");
    localStorage.removeItem("bm_plan");
    this._userId = null;
  }

  /** Wipe unscoped legacy keys (the ones that caused cross-account bleed) */
  private _wipeLegacyUnscopedKeys(): void {
    for (const key of USER_DATA_KEYS) {
      localStorage.removeItem(key);
    }
    // Also wipe any bm_ai_* and bm_actions_* and bm_coach_* unscoped variants
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        (k.startsWith("bm_ai_") || k.startsWith("bm_actions_") || k.startsWith("bm_coach_")) &&
        !k.startsWith("bm_u:")
      ) {
        toDelete.push(k);
      }
    }
    for (const k of toDelete) localStorage.removeItem(k);
  }

  /** Get the current userId — reads from Supabase session if not set */
  private _uid(): string | null {
    if (this._userId) return this._userId;
    if (typeof window === "undefined") return null;
    // Fall back to the stored marker (set during sign-in)
    return localStorage.getItem("bm_active_user_id");
  }

  // ── Core API ────────────────────────────────────────────────────────────────

  get(key: string): string | null {
    if (typeof window === "undefined") return null;
    // Global keys are not scoped
    if (GLOBAL_KEYS.has(key)) return localStorage.getItem(key);
    const uid = this._uid();
    if (!uid) return null; // No user — return nothing (safe default)
    // Try scoped key first, fall back to legacy unscoped (migration path)
    return (
      localStorage.getItem(scopedKey(uid, key)) ??
      localStorage.getItem(key) // legacy fallback — will be phased out
    );
  }

  set(key: string, value: string): void {
    if (typeof window === "undefined") return;
    if (GLOBAL_KEYS.has(key)) { localStorage.setItem(key, value); return; }
    const uid = this._uid();
    if (!uid) return; // No user — don't write
    localStorage.setItem(scopedKey(uid, key), value);
    // Remove legacy unscoped key if it exists (migrate on first write)
    localStorage.removeItem(key);
  }

  remove(key: string): void {
    if (typeof window === "undefined") return;
    if (GLOBAL_KEYS.has(key)) { localStorage.removeItem(key); return; }
    const uid = this._uid();
    if (uid) localStorage.removeItem(scopedKey(uid, key));
    localStorage.removeItem(key); // also remove legacy unscoped
  }

  getJSON<T>(key: string, fallback: T): T {
    try {
      const raw = this.get(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  setJSON<T>(key: string, value: T): void {
    this.set(key, JSON.stringify(value));
  }

  // ── Convenience helpers that replace lib/plan.ts equivalents ────────────────

  getStreak(): number {
    return Number(this.get("bm_streak") ?? "0");
  }
  setStreak(n: number): void {
    this.set("bm_streak", String(n));
  }

  getLastCheckinDate(): string {
    return this.get("bm_last_checkin_date") ?? "";
  }
  setLastCheckinDate(d: string): void {
    this.set("bm_last_checkin_date", d);
  }

  getAIMessagesToday(): number {
    const uid = this._uid();
    if (!uid || typeof window === "undefined") return 0;
    return Number(localStorage.getItem(aiDayKey(uid)) ?? "0");
  }
  recordAIMessage(): void {
    const uid = this._uid();
    if (!uid || typeof window === "undefined") return;
    const k = aiDayKey(uid);
    localStorage.setItem(k, String(this.getAIMessagesToday() + 1));
  }

  getActionsThisWeek(): number {
    const uid = this._uid();
    if (!uid || typeof window === "undefined") return 0;
    return Number(localStorage.getItem(scopedKey(uid, `bm_actions_${weekKey()}`)) ?? "0");
  }
  recordWeeklyAction(): void {
    const uid = this._uid();
    if (!uid || typeof window === "undefined") return;
    const k = scopedKey(uid, `bm_actions_${weekKey()}`);
    localStorage.setItem(k, String(this.getActionsThisWeek() + 1));
  }

  getCoachMessagesThisWeek(): number {
    const uid = this._uid();
    if (!uid || typeof window === "undefined") return 0;
    return Number(
      localStorage.getItem(scopedKey(uid, `bm_coach_${coachWeekKey()}`)) ?? "0"
    );
  }
  recordCoachMessage(): void {
    const uid = this._uid();
    if (!uid || typeof window === "undefined") return;
    const k = scopedKey(uid, `bm_coach_${coachWeekKey()}`);
    localStorage.setItem(k, String(this.getCoachMessagesThisWeek() + 1));
  }

  getPlan(): string | null {
    const uid = this._uid();
    if (!uid || typeof window === "undefined") return null;
    return localStorage.getItem(scopedKey(uid, "bm_plan"));
  }
  setPlan(plan: string): void {
    const uid = this._uid();
    if (!uid || typeof window === "undefined") return;
    localStorage.setItem(scopedKey(uid, "bm_plan"), plan);
    // Keep generic key for legacy callers — overwritten on next sign-in
    localStorage.setItem("bm_plan", plan);
    localStorage.setItem("bm_active_user_id", uid);
  }
}

// Singleton — import this everywhere instead of raw localStorage
export const storage = new UserScopedStorage();

// ── Auth listener — auto-wire sign-in / sign-out ─────────────────────────────
// Call this once at app boot (e.g. in app/layout.tsx or a client Provider).
// It listens to Supabase auth state changes and keeps the storage scope in sync.
export function initStorageAuthSync(supabase: {
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null } }>;
    onAuthStateChange: (
      cb: (event: string, session: { user?: { id: string } | null } | null) => void
    ) => { data: { subscription: { unsubscribe: () => void } } };
  };
}): () => void {
  // Eagerly set userId from current session
  supabase.auth.getUser().then(({ data }) => {
    if (data.user?.id) storage.onSignIn(data.user.id);
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user?.id) {
      storage.onSignIn(session.user.id);
    } else if (event === "SIGNED_OUT") {
      storage.onSignOut();
    } else if (event === "USER_UPDATED" && session?.user?.id) {
      storage.onSignIn(session.user.id);
    }
  });

  return () => subscription.unsubscribe();
}
