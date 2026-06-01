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
  "bm_push_prompted",
  "bm_push_prompt_shown",
  "bm_push_banner_dismissed",
  "bm_first_seen",
  "bm_domain",
  "bm_idea",
  "bm_active_project_id",
  "bm_has_onboarded",
  "bm_has_logged_in",
  "bm_tour_seen",
  "bm_tour_show",
  "bm_score_history",
  "bm_xp",
  "bm_notifications",
  "bm_morning_seeded",
  "bm_evening_seeded",
  "bm_task_debt",
  "bm_tasks_completed_total",
  "bm_session_id",
  "bm_funnel",
  "bm_funnel_events",
  "bm_page_views",
  "bm_session_events",
  "bm_blueprints",
  "bm_venture_tracks",
  "bm_blueprint_first_used",
  "bm_blueprint_usage",
  "bm_last_goal",
  "bm_idle_alerted",
  "bm_today_revenue_delta",
  "bm_first_task_completed_tracked",
  "bm_builder_sync_indicator_shown",
  "bm_testimonial_last_asked",
  "bm_urgency_dismissed",
  "buildmind_has_logged_in",
  "buildmind_show_tour",
  "buildmind_tour_seen",
  "buildmind_onboarded",
  "buildmind_active_project_id",
];

// Prefix format: "bm_u:<userId>:"
function scopedKey(userId: string, key: string): string {
  return `bm_u:${userId}:${key}`;
}

// Week/day key helpers (UTC, shared shape with plan.ts/usePlan.ts)
function aiDayKey(userId: string): string {
  return scopedKey(userId, `bm_ai_${new Date().toISOString().slice(0, 10)}`);
}
function weekKey(): string {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}_w${week}`;
}
function coachWeekKey(): string {
  const d = new Date();
  const day = d.getUTCDay() || 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - (day - 1));
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
}

class UserScopedStorage {
  private _userId: string | null = null;

  /** Call immediately after Supabase auth.getUser() resolves with a user */
  onSignIn(userId: string): void {
    if (typeof globalThis.window === "undefined") return;
    const prev = localStorage.getItem("bm_active_user_id");
    if (prev && prev !== userId) {
      // Different user signed in on this device — wipe their unscoped legacy keys
      // but keep their scoped data (it's already under bm_u:<prevUserId>:*)
      this._wipeLegacyUnscopedKeys();
    }
    if (!prev) {
      this._wipeLegacyUnscopedKeys();
    }
    this._userId = userId;
    localStorage.setItem("bm_active_user_id", userId);
  }

  /** Call on sign-out — clears unscoped legacy keys, keeps scoped data */
  onSignOut(): void {
    if (typeof globalThis.window === "undefined") return;
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
    // Also wipe dated/prefixed unscoped variants that contain account activity.
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        (
          k.startsWith("bm_ai_") ||
          k.startsWith("bm_actions_") ||
          k.startsWith("bm_coach_") ||
          k.startsWith("bm_task_done_") ||
          k.startsWith("bm_reflect_done_") ||
          k.startsWith("bm_checkin_done_date_") ||
          k.startsWith("bm_morning_checkin_") ||
          k.startsWith("bm_evening_checkin_") ||
          k.startsWith("bm_last_stage_") ||
          k.startsWith("bm_transition_dismissed_") ||
          k.startsWith("bm_stage_transition_dismissed_") ||
          k.startsWith("bm_testimonial_asked_")
        ) &&
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
    if (typeof globalThis.window === "undefined") return null;
    // Fall back to the stored marker (set during sign-in)
    return localStorage.getItem("bm_active_user_id");
  }

  // ── Core API ────────────────────────────────────────────────────────────────

  get(key: string): string | null {
    if (typeof globalThis.window === "undefined") return null;
    // Global keys are not scoped
    if (GLOBAL_KEYS.has(key)) return localStorage.getItem(key);
    const uid = this._uid();
    if (!uid) return localStorage.getItem(key);
    return localStorage.getItem(scopedKey(uid, key));
  }

  set(key: string, value: string): void {
    if (typeof globalThis.window === "undefined") return;
    if (GLOBAL_KEYS.has(key)) { localStorage.setItem(key, value); return; }
    const uid = this._uid();
    if (!uid) { localStorage.setItem(key, value); return; }
    localStorage.setItem(scopedKey(uid, key), value);
    // Remove legacy unscoped key if it exists (migrate on first write)
    localStorage.removeItem(key);
  }

  remove(key: string): void {
    if (typeof globalThis.window === "undefined") return;
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
    if (!uid || typeof globalThis.window === "undefined") return 0;
    return Number(localStorage.getItem(aiDayKey(uid)) ?? "0");
  }
  recordAIMessage(): void {
    const uid = this._uid();
    if (!uid || typeof globalThis.window === "undefined") return;
    const k = aiDayKey(uid);
    localStorage.setItem(k, String(this.getAIMessagesToday() + 1));
  }

  getActionsThisWeek(): number {
    const uid = this._uid();
    if (!uid || typeof globalThis.window === "undefined") return 0;
    return Number(localStorage.getItem(scopedKey(uid, `bm_actions_${weekKey()}`)) ?? "0");
  }
  recordWeeklyAction(): void {
    const uid = this._uid();
    if (!uid || typeof globalThis.window === "undefined") return;
    const k = scopedKey(uid, `bm_actions_${weekKey()}`);
    localStorage.setItem(k, String(this.getActionsThisWeek() + 1));
  }

  getCoachMessagesThisWeek(): number {
    const uid = this._uid();
    if (!uid || typeof globalThis.window === "undefined") return 0;
    return Number(
      localStorage.getItem(scopedKey(uid, `bm_coach_${coachWeekKey()}`)) ?? "0"
    );
  }
  recordCoachMessage(): void {
    const uid = this._uid();
    if (!uid || typeof globalThis.window === "undefined") return;
    const k = scopedKey(uid, `bm_coach_${coachWeekKey()}`);
    localStorage.setItem(k, String(this.getCoachMessagesThisWeek() + 1));
  }

  getPlan(): string | null {
    const uid = this._uid();
    if (!uid || typeof globalThis.window === "undefined") return null;
    return localStorage.getItem(scopedKey(uid, "bm_plan"));
  }
  setPlan(plan: string): void {
    const uid = this._uid();
    if (!uid || typeof globalThis.window === "undefined") return;
    localStorage.setItem(scopedKey(uid, "bm_plan"), plan);
    localStorage.removeItem("bm_plan");
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
    else storage.onSignOut();
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      storage.onSignOut();
    } else if (session?.user?.id) {
      storage.onSignIn(session.user.id);
    }
  });

  return () => subscription.unsubscribe();
}
