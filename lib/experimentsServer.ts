import type { SupabaseClient } from "@supabase/supabase-js";
import { experimentBlock, type Experiment, type ExperimentEvent } from "@/lib/experiments";

/** The founder's newest running experiment for this project (or any, without a project), with events. Null if none or the table is not there yet. */
export async function loadCurrentExperiment(admin: SupabaseClient, userId: string, projectId?: string | null): Promise<Experiment | null> {
  try {
    let q = admin.from("customer_experiments").select("*").eq("user_id", userId).eq("status", "running").order("updated_at", { ascending: false }).limit(1);
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q;
    const e = data?.[0] as Experiment | undefined;
    if (!e) return null;
    const { data: evs } = await admin.from("experiment_events").select("id, who, kind, detail, created_at").eq("experiment_id", e.id).order("created_at", { ascending: true }).limit(100);
    return { ...e, events: (evs ?? []) as ExperimentEvent[] };
  } catch {
    return null;
  }
}

export async function experimentContext(admin: SupabaseClient, userId: string, projectId?: string | null): Promise<string> {
  return experimentBlock(await loadCurrentExperiment(admin, userId, projectId));
}
