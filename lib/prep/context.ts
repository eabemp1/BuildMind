/**
 * What BuildMind can infer about a founder from their own record, with no
 * integrations: what they recently prepared, sent, and heard back, and how
 * their last tasks went. Every prepared draft is told this, so it is relevant
 * to where this founder actually is. It is context for relevance and tone,
 * never a source of new facts to state.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PREP_META, type PrepKind } from "@/lib/prep/kinds";

export interface WorkRow { kind: string; task_text: string | null; status: string; outcome: string | null; created_at: string }
export interface ReflectionRow { today_action: string | null; outcome: string | null; created_at: string }

const DAY = 86_400_000;
const ago = (iso: string, now: number) => {
  const d = Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY));
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
const OUTCOME: Record<string, string> = { replied: "got a reply", call_booked: "booked a call", no_reply: "no reply", got_comments: "got comments", no_response: "no response" };

/** Pure: turns recent records into a short block for prompts. Empty when there is nothing to say. */
export function inferredBlock(work: WorkRow[], reflections: ReflectionRow[], now = Date.now()): string {
  const lines: string[] = [];
  for (const w of work.slice(0, 6)) {
    const meta = PREP_META[w.kind as PrepKind];
    if (!meta) continue;
    const what = clip((w.task_text ?? "").replace(/\s+/g, " ").trim(), 90);
    const state = w.outcome ? OUTCOME[w.outcome] ?? w.outcome : w.status === "sent" ? "sent, no result recorded" : w.status === "prepared" ? "prepared, not used" : w.status;
    lines.push(`- ${meta.label} ${ago(w.created_at, now)}${what ? ` ("${what}")` : ""}: ${state}`);
  }
  for (const r of reflections.slice(0, 4)) {
    const what = clip((r.today_action ?? "").replace(/\s+/g, " ").trim(), 90);
    if (!what || !r.outcome) continue;
    lines.push(`- Task ${ago(r.created_at, now)} ("${what}"): ${r.outcome}`);
  }
  if (!lines.length) return "";
  const unused = work.filter((w) => w.status === "prepared").length;
  const tail = unused >= 3 ? "\n- Several prepared drafts were never used. Keep this one short and easy to act on." : "";
  return `WHAT BUILDMIND KNOWS FROM THIS FOUNDER'S OWN RECORD (for relevance and tone only. Do not restate it as new facts or invent anything beyond it):\n${lines.join("\n")}${tail}`;
}

export async function loadInferredContext(admin: SupabaseClient, userId: string): Promise<string> {
  try {
    const [w, r] = await Promise.all([
      admin.from("prepared_work").select("kind,task_text,status,outcome,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
      admin.from("reflections").select("today_action,outcome,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    ]);
    return inferredBlock((w.data ?? []) as WorkRow[], (r.data ?? []) as ReflectionRow[]);
  } catch { return ""; }
}
