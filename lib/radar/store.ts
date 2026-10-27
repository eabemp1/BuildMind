import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProject } from "@/lib/prep/engine";
import { fitFor, actionDate, daysUntil } from "@/lib/radar/fit";
import { nextMove, buildIcs } from "@/lib/radar/nextMove";
import type { RadarItem } from "@/lib/radar/types";

export interface RadarView extends RadarItem { fit: { score: number; band: "act" | "consider" | "skip"; reasons: string[]; cautions: string[] }; next_move: string; ics: string | null; days: number | null }

/** Matches the single-line reason saved when a founder cannot attend. */
export const CANT_ATTEND_RE = /^Can't attend \((?:place|time)\)$/gm;

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

/** A short block for the Today task generator: confirmed, worthwhile things that are due soon. Empty when there is nothing. */
export async function radarPromptBlock(admin: SupabaseClient, userId: string, projectId?: string | null, now = Date.now()): Promise<string> {
  const { items } = await listRadar(admin, userId, { projectId, now });
  const due = items.filter((i) => i.kind_confirmed && i.fit.band === "act" && i.days !== null && i.days >= 0 && i.days <= 7).slice(0, 2);
  if (!due.length) return "";
  const lines = due.map((i) => `- ${i.kind}: "${i.title}"${i.days === 0 ? ", due today" : `, in ${i.days} day${i.days === 1 ? "" : "s"}`}${i.location && !i.is_virtual ? `, at ${i.location}` : i.meeting_url || i.is_virtual ? ", online" : ""}. Next step: ${i.next_move}`);
  return `OPPORTUNITIES THE FOUNDER ALREADY TRACKS (confirmed, worth acting on this week). If today's task can honestly advance one of these, make it that task and use these exact details. If it does not fit their current direction, stated blockers or access, ignore this block. Never add details that are not written here:\n${lines.join("\n")}`;
}

