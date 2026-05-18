/**
 * lib/notifications.ts — BuildMind Notifications Engine
 *
 * Generates contextual in-app notifications based on:
 * - Streak status (broken, milestone reached)
 * - Task completion patterns
 * - Weekly report ready
 * - Achievement unlocks (handled via achievements.ts)
 * - Inactivity nudges
 * - Plan upgrade triggers
 *
 * Stored in localStorage. Supabase persistence is additive (doesn't break local).
 */

import { getStoredStreak } from "@/lib/plan";
import { storage } from "@/lib/storage";

export type NotifType =
  | "streak_broken"
  | "streak_milestone"
  | "task_done"
  | "weekly_report_ready"
  | "inactivity_nudge"
  | "upgrade_nudge"
  | "achievement"
  | "reflect_pending"
  | "welcome";

export type NotifPriority = "low" | "medium" | "high" | "urgent";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  emoji: string;
  priority: NotifPriority;
  createdAt: number;
  readAt?: number;
  actionLabel?: string;
  actionHref?: string;
  expiresAt?: number; // auto-dismiss after this timestamp
}

const STORAGE_KEY = "bm_notifications";
const MAX_NOTIFS = 50;

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function getAllNotifications(): AppNotification[] {
  if (typeof window === "undefined") return [];
  const all = storage.getJSON<AppNotification[]>(STORAGE_KEY, []);
  const now = Date.now();
  return all.filter(n => !n.expiresAt || n.expiresAt > now);
}

export function getUnreadNotifications(): AppNotification[] {
  return getAllNotifications()
    .filter(n => !n.readAt)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getUnreadCount(): number {
  return getUnreadNotifications().length;
}

// Legacy-compatible exports (v4/v6 call-sites expect these names)
export const getUnreadNotificationCount = getUnreadCount;
export const markNotificationAsRead = markRead;
export const getNotificationsForCurrentUser = getAllNotifications;
export const createNotificationForCurrentUser = addNotification;

function saveNotifications(notifs: AppNotification[]): void {
  storage.setJSON(STORAGE_KEY, notifs.slice(0, MAX_NOTIFS));
}

export function addNotification(notif: Omit<AppNotification, "id" | "createdAt">): AppNotification {
  const full: AppNotification = {
    ...notif,
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  };
  const existing = getAllNotifications();
  // Deduplicate by type — don't add same type if one exists unread in last 24h
  const recent = existing.find(n =>
    n.type === notif.type && !n.readAt && Date.now() - n.createdAt < 24 * 60 * 60 * 1000
  );
  if (recent) return recent;
  saveNotifications([full, ...existing]);
  // Dispatch event so any open NotificationBell updates
  window.dispatchEvent(new Event("bm_notification_added"));
  return full;
}

export function markRead(id: string): void {
  if (typeof window === "undefined") return;
  const notifs = getAllNotifications();
  const idx = notifs.findIndex(n => n.id === id);
  if (idx !== -1) { notifs[idx].readAt = Date.now(); saveNotifications(notifs); }
}

export function markAllRead(): void {
  if (typeof window === "undefined") return;
  const notifs = getAllNotifications();
  const now = Date.now();
  notifs.forEach(n => { if (!n.readAt) n.readAt = now; });
  saveNotifications(notifs);
}

export function deleteNotification(id: string): void {
  if (typeof window === "undefined") return;
  saveNotifications(getAllNotifications().filter(n => n.id !== id));
}

// ── Smart notification generators (call these from the right places) ──────────

export function notifyStreakBroken(lastStreak: number): void {
  addNotification({
    type: "streak_broken",
    emoji: "💔",
    title: "Streak broken",
    body: `Your ${lastStreak}-day streak ended. Start a new one today — consistency is the only moat.`,
    priority: "high",
    actionLabel: "Do today's action →",
    actionHref: "/today",
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
}

export function notifyStreakMilestone(streak: number): void {
  const milestones: Record<number, { emoji: string; title: string }> = {
    3:   { emoji: "🔥", title: "3-day streak!" },
    7:   { emoji: "⚔️", title: "One week warrior" },
    14:  { emoji: "🛡️", title: "Two weeks strong" },
    30:  { emoji: "💎", title: "30-day iron founder" },
    100: { emoji: "🏆", title: "100 days. Legendary." },
  };
  const m = milestones[streak];
  if (!m) return;
  addNotification({
    type: "streak_milestone",
    emoji: m.emoji,
    title: m.title,
    body: `${streak} consecutive days of action. That's how startups actually get built.`,
    priority: "medium",
    actionLabel: "View badges →",
    actionHref: "/achievements",
    expiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
  });
}

export function notifyReflectPending(): void {
  addNotification({
    type: "reflect_pending",
    emoji: "🧠",
    title: "Close the loop",
    body: "You completed today's action. Log what happened — it changes tomorrow's task.",
    priority: "medium",
    actionLabel: "Reflect now →",
    actionHref: "/reflect",
    expiresAt: Date.now() + 18 * 60 * 60 * 1000, // expires end of day
  });
}

export function notifyWeeklyReportReady(): void {
  const now = new Date();
  if (now.getDay() !== 5) return; // Fridays only
  addNotification({
    type: "weekly_report_ready",
    emoji: "📋",
    title: "Weekly report ready",
    body: "Your Friday analysis is in. Intention vs action gap, momentum score, what to fix next week.",
    priority: "high",
    actionLabel: "Read report →",
    actionHref: "/reports",
    expiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
  });
}

export function notifyInactivity(daysSinceLastAction: number): void {
  if (daysSinceLastAction < 2) return;
  const messages: Record<number, string> = {
    2: "You haven't acted in 2 days. Every day you don't ship, a competitor does.",
    3: "3 days off track. One action today resets the momentum.",
    7: "A week without action. Your startup doesn't die from failure — it dies from inaction.",
  };
  const body = messages[daysSinceLastAction] ?? `${daysSinceLastAction} days since your last action. Come back.`;
  addNotification({
    type: "inactivity_nudge",
    emoji: "⏰",
    title: "Still building?",
    body,
    priority: daysSinceLastAction >= 7 ? "urgent" : "high",
    actionLabel: "Get back on track →",
    actionHref: "/today",
    expiresAt: Date.now() + 2 * 24 * 60 * 60 * 1000,
  });
}

export function notifyUpgradeNudge(reason: "weekly_limit" | "ai_limit" | "feature"): void {
  const messages = {
    weekly_limit: "You've hit your weekly action limit. Builder removes all limits.",
    ai_limit: "You've used all 3 daily AI messages. Builder is unlimited.",
    feature: "This feature is on Builder plan. One upgrade, every tool unlocked.",
  };
  addNotification({
    type: "upgrade_nudge",
    emoji: "⚡",
    title: "Unlock more",
    body: messages[reason],
    priority: "medium",
    actionLabel: "Upgrade to Builder →",
    actionHref: "/upgrade",
    expiresAt: Date.now() + 5 * 24 * 60 * 60 * 1000,
  });
}

export function notifyWelcome(): void {
  const existing = getAllNotifications().find(n => n.type === "welcome");
  if (existing) return;
  addNotification({
    type: "welcome",
    emoji: "👋",
    title: "Welcome to BuildMind",
    body: "One action per day. Reflected on. Compounding. That's the whole system. Start with Today →",
    priority: "high",
    actionLabel: "Get today's action →",
    actionHref: "/today",
  });
}

// ── Notification checker (run on app init) ────────────────────────────────────
export function runNotificationChecks(): void {
  if (typeof window === "undefined") return;

  // Welcome (first time)
  notifyWelcome();

  // Reflect pending
  if (storage.get("bm_reflect_pending") === "true") {
    notifyReflectPending();
  }

  // Weekly report on Fridays
  notifyWeeklyReportReady();

  const streak = getStoredStreak();
  const lastDone = storage.get("bm_today_done_date");
  if (lastDone) {
    const daysSince = Math.floor((Date.now() - new Date(lastDone).getTime()) / 86400000);
    if (daysSince >= 2) {
      // Streak might be broken
      notifyInactivity(daysSince);
    }
  }

  // Streak milestones
  [3, 7, 14, 30, 100].forEach(m => {
    if (streak === m) notifyStreakMilestone(m);
  });
}

export function clearNotificationsForCurrentUser(): void {
  if (typeof window === "undefined") return;
  storage.remove(STORAGE_KEY);
}

// ── Morning briefing & Evening check in-app notifications ─────────────────────
// These bridge the gap between the Supabase Edge Function scheduled jobs and
// the in-app notification store. Call seedScheduledNotifications() on app init.

const MORNING_SEED_KEY  = "bm_morning_notif_seeded";
const EVENING_SEED_KEY  = "bm_evening_notif_seeded";

/**
 * seedMorningBriefing — creates an in-app "Morning briefing ready" notification
 * if it's morning hours and one hasn't been seeded today.
 */
export function seedMorningBriefing(): void {
  if (typeof window === "undefined") return;
  const today = new Date().toISOString().slice(0, 10);
  if (storage.get(MORNING_SEED_KEY) === today) return;

  const hour = new Date().getHours();
  if (hour < 5 || hour >= 11) return;

  storage.set(MORNING_SEED_KEY, today);
  addNotification({
    type: "reflect_pending", // reuse existing type for bell display
    emoji: "🌅",
    title: "Morning briefing ready",
    body: "Your win, biggest risk, and one action for today are waiting.",
    priority: "high",
    actionLabel: "Read briefing →",
    actionHref: "/today",
    expiresAt: Date.now() + 8 * 60 * 60 * 1000, // expires after 8h
  });
}

/**
 * seedEveningCheck — creates an in-app evening check-in notification
 * if it's evening and one hasn't been seeded today.
 */
export function seedEveningCheck(): void {
  if (typeof window === "undefined") return;
  const today = new Date().toISOString().slice(0, 10);
  if (storage.get(EVENING_SEED_KEY) === today) return;

  const hour = new Date().getHours();
  if (hour < 16 || hour >= 21) return;

  const reflectedToday = storage.get("bm_today_done_date") === today;
  if (reflectedToday) return;

  storage.set(EVENING_SEED_KEY, today);
  addNotification({
    type: "reflect_pending",
    emoji: "🌇",
    title: "Evening check-in",
    body: "Did you make progress today? Log it before tomorrow — the reflexion loop needs your input.",
    priority: "high",
    actionLabel: "Reflect now →",
    actionHref: "/reflect",
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
  });
}

/**
 * seedScheduledNotifications — call once on app init (in providers or layout).
 * Seeds both morning briefing and evening check-in in-app notifications
 * based on current local time, so they appear even without push permissions.
 */
export function seedScheduledNotifications(): void {
  seedMorningBriefing();
  seedEveningCheck();
}
