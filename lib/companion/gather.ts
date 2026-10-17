/**
 * lib/companion/gather.ts — server-side: read the founder's records for the Co-founder.
 * Best-effort throughout: a missing table or column just means fewer moments.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFounderSnapshot } from "@/lib/server/founderSnapshot";
import { isTodayFlowSession } from "@/lib/todayFlowSessions";
import type { CompanionInput, TaskRow, Style } from "@/lib/companion/moments";
import type { Intensity, EventRow } from "@/lib/companion/policy";

const DAY = 86_400_000;
export const STYLES: Style[] = ["direct-challenger", "strategic-partner", "execution-coach", "devil-advocate"];
export const INTENSITIES: Intensity[] = ["quiet", "balanced", "relentless"];

export async function loadPrefs(admin: SupabaseClient, userId: string): Promise<{ style: Style; intensity: Intensity }> {
  let style: Style = "execution-coach";
  let intensity: Intensity = "balanced";
  try {
    const { data } = await admin.from("founder_memory").select("cofounder_style, avoidance_zones").eq("user_id", userId).maybeSingle();
    const s = (data as { cofounder_style?: string } | null)?.cofounder_style;
    if (s && (STYLES as string[]).includes(s)) style = s as Style;
  } catch { /* default */ }
  try {
    const { data } = await admin.from("companion_settings").select("intensity").eq("user_id", userId).maybeSingle();
    const i = (data as { intensity?: string } | null)?.intensity;
    if (i && (INTENSITIES as string[]).includes(i)) intensity = i as Intensity;
  } catch { /* default */ }
  return { style, intensity };
}

export async function loadHistory(admin: SupabaseClient, userId: string): Promise<EventRow[]> {
  try {
    const since = new Date(Date.now() - 10 * DAY).toISOString().slice(0, 10);
    const { data } = await admin.from("companion_events").select("moment_key, status, day, updated_at").eq("user_id", userId).gte("day", since);
    return ((data ?? []) as Array<{ moment_key: string; status: EventRow["status"]; day: string; updated_at: string }>)
      .map((r) => ({ key: r.moment_key, status: r.status, day: r.day, created_at: r.updated_at }));
  } catch { return []; }
}

export async function gatherInput(admin: SupabaseClient, userId: string, projectId?: string): Promise<CompanionInput> {
  const now = Date.now();
  const since21 = new Date(now - 21 * DAY).toISOString();
  const startOfDay = new Date(new Date(now).toISOString().slice(0, 10)).toISOString();

  const [snap, mem, log, refl] = await Promise.allSettled([
    getFounderSnapshot(userId, projectId),
    admin.from("founder_memory").select("avoidance_zones").eq("user_id", userId).maybeSingle(),
    admin.from("reflexion_learning_log").select("action_shown, action_type, outcome, created_at, session_id, prediction_source").eq("user_id", userId).gte("created_at", since21).order("created_at", { ascending: false }).limit(200),
    admin.from("reflections").select("created_at").eq("user_id", userId).gte("created_at", startOfDay).limit(5),
  ]);

  const snapshot = snap.status === "fulfilled" ? {
    streak: snap.value.streak, completedToday: snap.value.completedToday,
    daysInactive: snap.value.daysInactive, worstOverdue: snap.value.worstOverdue,
  } : null;

  const zonesRaw = mem.status === "fulfilled" ? (mem.value.data as { avoidance_zones?: unknown } | null)?.avoidance_zones : null;
  const avoidanceZones = Array.isArray(zonesRaw) ? (zonesRaw as unknown[]).filter((z): z is string => typeof z === "string") : [];

  const rows = log.status === "fulfilled" ? ((log.value.data ?? []) as Array<TaskRow & { session_id?: string | null; prediction_source?: string | null }>) : [];
  const tasks = rows.filter((r) => isTodayFlowSession(r.session_id ?? "") && r.prediction_source !== "founder_intelligence");
  const completedTodayTitles = tasks.filter((t) => t.outcome === "completed" && t.created_at >= startOfDay && t.action_shown).map((t) => t.action_shown as string);

  const reflectionsToday = refl.status === "fulfilled" ? (refl.value.data ?? []).length : 0;
  return { now, snapshot, avoidanceZones, tasks, completedTodayTitles, reflectionsToday };
}
