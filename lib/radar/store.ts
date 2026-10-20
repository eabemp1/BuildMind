import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProject } from "@/lib/prep/engine";
import { fitFor, actionDate, daysUntil } from "@/lib/radar/fit";
import { nextMove, buildIcs } from "@/lib/radar/nextMove";
import type { RadarItem } from "@/lib/radar/types";

export interface RadarView extends RadarItem { fit: { score: number; band: "act" | "consider" | "skip"; reasons: string[]; cautions: string[] }; next_move: string; ics: string | null; days: number | null }

export async function listRadar(admin: SupabaseClient, userId: string, opts: { projectId?: string | null; where?: string; now?: number } = {}): Promise<{ items: RadarView[]; setup: boolean }> {
  const now = opts.now ?? Date.now();
  const { data, error } = await admin.from("radar_items").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(200);
  if (error) return { items: [], setup: true };
  const project = await loadProject(admin, userId, opts.projectId);
  const ctx = { stage: project.stage, projectText: [project.name, project.description, project.problem, project.targetUsers].join(" "), homeWhere: opts.where, now };
  const items = ((data ?? []) as RadarItem[])
    .filter((i) => i.status !== "dismissed" && i.status !== "done")
    .map((i): RadarView => {
      const fit = fitFor(i, ctx);
      return { ...i, fit, next_move: nextMove(i, now), ics: buildIcs(i, now), days: daysUntil(actionDate(i), now) };
    })
    .sort((a, b) => b.fit.score - a.fit.score);
  return { items, setup: false };
}

/** What belongs on Today: worth acting on, and within reach. Never more than two. */
export function todayPicks(items: RadarView[]): RadarView[] {
  return items
    .filter((i) => i.fit.band !== "skip" && i.kind_confirmed && (i.days === null ? false : i.days >= (i.type === "person" ? -30 : 0) && i.days <= 14))
    .slice(0, 2);
}
