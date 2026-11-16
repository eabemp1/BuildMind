import type { SupabaseClient } from "@supabase/supabase-js";
import { experimentBlock, effectiveEvents, type Experiment, type ExperimentEvent } from "@/lib/experiments";
import { loopBlock, loopStage, type Evidence, type LoopStage, type Offer } from "@/lib/experimentLoop";
import { loadProject } from "@/lib/prep/engine";
import { loadTestMode } from "@/lib/testMode";

export const EVENT_COLS = "id, experiment_id, who, kind, detail, created_at, corrects_id, synthetic";

/** Evidence and offer versions for experiments. Quietly empty when the loop migration has not been run. */
export async function loadLoopRecords(admin: SupabaseClient, ids: string[]): Promise<{ evidence: Array<Evidence & { experiment_id: string }>; offers: Array<Offer & { experiment_id: string }> }> {
  if (!ids.length) return { evidence: [], offers: [] };
  try {
    const [ev, of] = await Promise.all([
      admin.from("experiment_evidence").select("id, experiment_id, kind, status, note, source, source_date, last_checked, created_at, synthetic").in("experiment_id", ids).order("created_at", { ascending: true }).limit(300),
      admin.from("experiment_offers").select("id, experiment_id, version, problem, solution, availability, scope, proof, price_hypothesis, evidence_ids, created_at, synthetic").in("experiment_id", ids).order("version", { ascending: true }).limit(300),
    ]);
    return { evidence: (ev.error ? [] : ev.data ?? []) as Array<Evidence & { experiment_id: string }>, offers: (of.error ? [] : of.data ?? []) as Array<Offer & { experiment_id: string }> };
  } catch {
    return { evidence: [], offers: [] };
  }
}

/** The stage this experiment is at: the founder's choice, else the project's stage, with a confirmed payment moving Launch to after revenue. */
export async function stageFor(admin: SupabaseClient, userId: string, exp: { stage?: string | null; project_id?: string | null }, events: ExperimentEvent[]): Promise<{ stage: LoopStage; projectStage: string | null }> {
  let projectStage: string | null = null;
  try { projectStage = (await loadProject(admin, userId, exp.project_id ?? null)).stage ?? null; } catch { /* project unreadable: the most cautious stage applies */ }
  const paid = effectiveEvents(events).some((e) => e.kind === "paid");
  return { stage: loopStage(exp.stage, projectStage, paid), projectStage };
}

/** The founder's newest running experiment for this project (or any, without a project), with events. Null if none or the table is not there yet. */
export async function loadCurrentExperiment(admin: SupabaseClient, userId: string, projectId?: string | null): Promise<Experiment | null> {
  try {
    let q = admin.from("customer_experiments").select("*").eq("user_id", userId).eq("status", "running").order("updated_at", { ascending: false }).limit(1);
    if (projectId) q = q.eq("project_id", projectId);
    const { data } = await q;
    const e = data?.[0] as Experiment | undefined;
    if (!e) return null;
    let evs: unknown[] | null;
    const first = await admin.from("experiment_events").select(EVENT_COLS).eq("experiment_id", e.id).order("created_at", { ascending: true }).limit(200);
    evs = first.data;
    // Before the loop migration the newer columns are not there; fall back so the experiment still reaches Coach.
    if (first.error) evs = (await admin.from("experiment_events").select("id, experiment_id, who, kind, detail, created_at").eq("experiment_id", e.id).order("created_at", { ascending: true }).limit(200)).data;
    return { ...e, events: (evs ?? []) as unknown as ExperimentEvent[] };
  } catch {
    return null;
  }
}

export async function experimentContext(admin: SupabaseClient, userId: string, projectId?: string | null): Promise<string> {
  const e = await loadCurrentExperiment(admin, userId, projectId);
  if (!e) return "";
  const base = experimentBlock(e);
  try {
    if (await loadTestMode(admin, userId)) return `${base}\nThis account is marked as a test run: nothing recorded counts as real.`;
    const { evidence, offers } = await loadLoopRecords(admin, [e.id]);
    const { stage } = await stageFor(admin, userId, e, e.events ?? []);
    const offer = offers.length ? offers[offers.length - 1] : null;
    return `${base}\n${loopBlock(stage, evidence, offer, e.events ?? [])}`;
  } catch {
    return base;
  }
}
