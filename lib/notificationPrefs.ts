/**
 * lib/notificationPrefs.ts
 *
 * The three notification switches in Settings. Stored per user under the
 * `notification_prefs` key of user_behavior_state, so the senders (cron jobs)
 * and the Settings page read the same value.
 *
 * Defaults match what the Settings page has always shown: streak reminders on,
 * weekly report on, coach tips off.
 */

export type NotificationPrefs = {
  streakReminder: boolean;
  weeklyReport: boolean;
  coachTips: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  streakReminder: true,
  weeklyReport: true,
  coachTips: false,
};

export const NOTIFICATION_PREFS_KEY = "notification_prefs";

/** Accepts anything stored in the database and returns a complete, typed value. */
export function parseNotificationPrefs(value: unknown): NotificationPrefs {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const pick = (k: keyof NotificationPrefs) => (typeof v[k] === "boolean" ? (v[k] as boolean) : DEFAULT_NOTIFICATION_PREFS[k]);
  return { streakReminder: pick("streakReminder"), weeklyReport: pick("weeklyReport"), coachTips: pick("coachTips") };
}
