import type { SupabaseClient } from "@supabase/supabase-js";
import type { SwapMode, SwapRecord } from "@/lib/today/swap";
import { logError } from "@/lib/server/logger";

/** All best-effort: a missing table (migration not run yet) never breaks task generation. */

export async function loadSwapHistory(admin: SupabaseClient | null, userId: string): Promise<SwapRecord[]> {
  if (!admin) return [];
  try {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data, error } = await admin.from("today_swaps").select("mode, reason, outcome, created_at").eq("user_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(20);
    if (error) { logError("today/swapStore/load", error, { userId }); return []; }
    return (data ?? []) as SwapRecord[];
  } catch (err) { logError("today/swapStore/load", err, { userId }); return []; }
}

export async function recordSwap(admin: SupabaseClient | null, row: {
  userId: string; projectId?: string | null; rejected: string; rejectedKind: string | null; reason: string | null;
  mode: SwapMode; replacement: string; replacementKind: string; guarded: boolean;
}): Promise<void> {
  if (!admin) return;
  try {
    await admin.from("today_swaps").insert({
      user_id: row.userId, project_id: row.projectId ?? null, rejected_task: row.rejected.slice(0, 500), rejected_kind: row.rejectedKind,
      reason: row.reason, mode: row.mode, replacement_task: row.replacement.slice(0, 500), replacement_kind: row.replacementKind, guarded: row.guarded,
    });
  } catch (err) { logError("today/swapStore/record", err, { userId: row.userId }); /* learning is best-effort */ }
}

/** Called when a reflection lands: if it is about a swapped-in task, record how it went. */
export async function resolveSwap(admin: SupabaseClient | null, userId: string, task: string | null | undefined, outcome: string): Promise<void> {
  if (!admin || !task) return;
  try {
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const { data } = await admin.from("today_swaps").select("id, replacement_task").eq("user_id", userId).is("outcome", null).gte("created_at", since).order("created_at", { ascending: false }).limit(5);
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
    const hit = (data ?? []).find((r: { replacement_task: string | null }) => r.replacement_task && norm(r.replacement_task) === norm(task));
    if (hit) await admin.from("today_swaps").update({ outcome, resolved_at: new Date().toISOString() }).eq("id", (hit as { id: string }).id).eq("user_id", userId);
  } catch (err) { logError("today/swapStore/resolve", err, { userId }); /* best-effort */ }
}
