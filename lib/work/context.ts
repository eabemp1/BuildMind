/**
 * lib/work/context.ts — what the founder's own record says, for the work engine.
 * Their reflections hold the real evidence: what they tried, what happened, what they learned. A draft that
 * knows this is written for where they actually are. It is context for relevance, never a source of new facts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadInferredContext } from "@/lib/prep/context";

export interface NoteRow { outcome: string | null; what_tried?: string | null; what_happened?: string | null; what_learned?: string | null; blocker?: string | null; created_at: string }

const DAY = 86_400_000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const ago = (iso: string, now: number) => { const d = Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY)); return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };

/** Pure: the founder's own notes, newest first, as short lines. Empty when they have written nothing useful. */
export function evidenceBlock(rows: NoteRow[], now = Date.now()): string {
  const lines: string[] = [];
  for (const r of rows) {
    const happened = clean(r.what_happened), learned = clean(r.what_learned), blocker = clean(r.blocker);
    if (happened.length < 12 && learned.length < 12 && blocker.length < 12) continue;
    const parts = [
      happened.length >= 12 ? `what happened: "${clip(happened, 160)}"` : "",
      learned.length >= 12 ? `what they learned: "${clip(learned, 160)}"` : "",
      blocker.length >= 12 ? `what got in the way: "${clip(blocker, 120)}"` : "",
    ].filter(Boolean);
    lines.push(`- ${ago(r.created_at, now)}${r.outcome ? ` (${r.outcome})` : ""}: ${parts.join("; ")}`);
    if (lines.length >= 5) break;
  }
  return lines.length ? `THE FOUNDER'S OWN NOTES (real things that happened to them, in their words). Use them so the draft fits where they are, and echo a real detail where it helps. Do not invent anything beyond them:\n${lines.join("\n")}` : "";
}

export async function loadWorkContext(admin: SupabaseClient, userId: string, projectId?: string | null): Promise<string> {
  try {
    let q = admin.from("reflections").select("outcome,what_tried,what_happened,what_learned,blocker,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(12);
    if (projectId) q = q.or(`project_id.eq.${projectId},project_id.is.null`);
    const [{ data }, record] = await Promise.all([q, loadInferredContext(admin, userId)]);
    return [evidenceBlock((data ?? []) as NoteRow[]), record].filter(Boolean).join("\n\n");
  } catch { return ""; }
}
