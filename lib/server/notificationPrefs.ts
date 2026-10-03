import { parseNotificationPrefs, NOTIFICATION_PREFS_KEY, type NotificationPrefs } from "@/lib/notificationPrefs";

/** The slice of a Supabase client these helpers need (keeps them easy to test). */
type PrefsClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        in: (col: string, vals: string[]) => PromiseLike<{ data: Array<{ user_id: string; value: unknown }> | null; error: unknown }>;
      };
    };
  };
};

/**
 * Loads every listed user's notification switches. Users who never touched
 * Settings get the defaults. If the lookup fails we return an empty map, which
 * callers treat as "defaults" - a database hiccup must not silence everyone.
 */
export async function loadNotificationPrefs(client: unknown, userIds: string[]): Promise<Map<string, NotificationPrefs>> {
  const out = new Map<string, NotificationPrefs>();
  const c = client as PrefsClient;
  const BATCH = 200;
  for (let i = 0; i < userIds.length; i += BATCH) {
    const ids = userIds.slice(i, i + BATCH);
    try {
      const { data, error } = await c.from("user_behavior_state").select("user_id, value").eq("key", NOTIFICATION_PREFS_KEY).in("user_id", ids);
      if (error || !data) continue;
      for (const row of data) out.set(row.user_id, parseNotificationPrefs(row.value));
    } catch {
      /* fall through to defaults */
    }
  }
  return out;
}

/** Keeps only the users who have this switch on (defaults apply to users with no saved choice). */
export async function filterByNotificationPref(client: unknown, userIds: string[], pref: keyof NotificationPrefs): Promise<string[]> {
  const prefs = await loadNotificationPrefs(client, userIds);
  return userIds.filter((id) => (prefs.get(id) ?? parseNotificationPrefs(null))[pref]);
}
