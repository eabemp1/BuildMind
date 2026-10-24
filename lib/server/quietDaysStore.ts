import { normalizeQuietDays, isQuietDay } from "@/lib/quietDays";

type Admin = { from: (t: string) => any };

/**
 * Quiet days for a founder. Tolerant on purpose: before migration 20261024000000 the column does not exist,
 * and a missing column must never break a screen, so this returns [] on any error.
 */
export async function loadQuietDays(admin: Admin, userId: string, today: string): Promise<string[]> {
  try {
    const { data, error } = await admin.from("founder_context").select("quiet_days").eq("user_id", userId).maybeSingle();
    if (error) return [];
    return normalizeQuietDays(data?.quiet_days, today);
  } catch { return []; }
}

/** Of these users, the ones resting today (no nudges). Returns an empty set if quiet days are not available yet. */
export async function usersQuietToday(admin: Admin, userIds: string[], today: string): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    for (let i = 0; i < userIds.length; i += 100) {
      const batch = userIds.slice(i, i + 100);
      const { data, error } = await admin.from("founder_context").select("user_id, quiet_days").in("user_id", batch);
      if (error) return new Set();
      for (const r of (data ?? []) as Array<{ user_id: string; quiet_days?: string[] | null }>) if (isQuietDay(r.quiet_days, today)) out.add(r.user_id);
    }
  } catch { return new Set(); }
  return out;
}
