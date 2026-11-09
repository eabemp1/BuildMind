/**
 * lib/server/milestoneSync.ts — keep milestones.status truthful after a server-side task change. SERVER-SIDE ONLY.
 * Stage progress no longer depends on this (it reads the tasks), but other readers (weekly report, Today, the roadmap)
 * still look at the stored status, so every path that completes or reopens a task should call this.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Pure: what the milestone's status should be, given its tasks. Returns null when nothing should change. */
export function nextMilestoneStatus(tasks: Array<{ is_completed: boolean | null }>, current: string | null): "completed" | "in_progress" | null {
  if (tasks.length === 0) return null;
  const allDone = tasks.every((t) => !!t.is_completed);
  if (allDone) return current === "completed" ? null : "completed";
  return current === "completed" ? "in_progress" : null;
}

export async function syncMilestoneForTask(admin: SupabaseClient, taskId: string, userId: string): Promise<void> {
  try {
    const { data: task } = await admin.from("tasks").select("milestone_id").eq("id", taskId).eq("user_id", userId).maybeSingle();
    if (!task?.milestone_id) return;
    const [{ data: tasks }, { data: ms }] = await Promise.all([
      admin.from("tasks").select("is_completed").eq("milestone_id", task.milestone_id),
      admin.from("milestones").select("status").eq("id", task.milestone_id).eq("user_id", userId).maybeSingle(),
    ]);
    if (!ms) return;
    const next = nextMilestoneStatus((tasks ?? []) as Array<{ is_completed: boolean | null }>, ms.status ?? null);
    if (next) await admin.from("milestones").update({ status: next }).eq("id", task.milestone_id).eq("user_id", userId);
  } catch (err) {
    console.warn("[milestone-sync] failed:", (err as Error)?.message ?? err); // never block the founder's action
  }
}
