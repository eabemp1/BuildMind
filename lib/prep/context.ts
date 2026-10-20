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
export interface ReflectionRow { today_action: string | null; outcome: string | null; created_at: string; what_tried?: string | null; blocker?: string | null }
export interface FeedbackRow { task_text: string | null; reason: string; note: string | null; created_at: string }

const REASON: Record<string, string> = {
  no_users: "The founder said they have no users or beta users yet. Never assume they do.",
  no_access: "The founder said they have no access to the person or channel a task named.",
  already_done: "The founder said a task was already done.",
  too_big: "The founder said a task was too big. Keep this one small.",
  not_relevant: "The founder said a task was not relevant to them.",
  no_time: "The founder said they had no time for a task.",
};

const DAY = 86_400_000;
const ago = (iso: string, now: number) => {
  const d = Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY));
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
const OUTCOME: Record<string, string> = { replied: "got a reply", call_booked: "booked a call", no_reply: "no reply", got_comments: "got comments", no_response: "no response" };

/** Pure: turns recent records into a short block for prompts. Empty when there is nothing to say. */
export function inferredBlock(work: WorkRow[], reflections: ReflectionRow[], now = Date.now(), demoTitle?: string | null, feedback: FeedbackRow[] = []): string {
  const lines: string[] = [];
  const said = new Set<string>();
  for (const f of feedback.slice(0, 6)) { const r = REASON[f.reason]; if (r && !said.has(r)) { said.add(r); lines.push(`- ${r}`); } }
  for (const r of reflections.slice(0, 8)) {
    const own = (r.blocker || (r.outcome === "blocked" || r.outcome === "partial" ? r.what_tried : "") || "").replace(/\s+/g, " ").trim();
    if (own.length >= 12 && /\b(don't|do not|didn't|haven't|no|can't|cannot|without)\b/i.test(own)) lines.push(`- In their own words ${ago(r.created_at, now)}: "${clip(own, 140)}"`);
    if (lines.filter((l) => l.startsWith("- In their own words")).length >= 3) break;
  }
  if (demoTitle) lines.push(`- The founder has recorded a demo video ("${clip(demoTitle, 80)}"). Suggest embedding or linking it where it helps.`);
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
    const [w, r, v, fb] = await Promise.all([
      admin.from("prepared_work").select("kind,task_text,status,outcome,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
      admin.from("reflections").select("today_action,outcome,created_at,what_tried,blocker").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
      admin.from("prepared_work").select("payload").eq("user_id", userId).eq("kind", "video_script").order("updated_at", { ascending: false }).limit(5),
      admin.from("today_feedback").select("task_text,reason,note,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(6),
    ]);
    const demo = ((v.data ?? []) as Array<{ payload: { recorded?: { title?: string } } | null }>).map((x) => x.payload?.recorded?.title).find(Boolean);
    return inferredBlock((w.data ?? []) as WorkRow[], (r.data ?? []) as ReflectionRow[], Date.now(), demo, (fb.data ?? []) as FeedbackRow[]);
  } catch { return ""; }
}
