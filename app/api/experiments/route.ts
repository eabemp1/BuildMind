/**
 * /api/experiments
 *   GET    ?projectId=   the founder's experiments, newest first, each with its events, evidence, offer versions and loop stage
 *   POST   { goal, hypothesis?, audience?, plan?, projectId? }   start one
 *   PATCH  { id, decision?, decision_note?, status?, stage?, milestone_id? }    record the decision, archive, or set the stage you are really at
 * Needs supabase/migrations/20261116000000_customer_experiments.sql. Without it the answer says "setup".
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { DECISIONS, parseNewExperiment, type ExperimentEvent } from "@/lib/experiments";
import { LOOP_STAGES } from "@/lib/experimentLoop";
import { EVENT_COLS, loadLoopRecords, loadMilestones, stageFor } from "@/lib/experimentsServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message ?? ""));

export async function GET(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId");
  const admin = createAdminClient();
  let q = admin.from("customer_experiments").select("*").eq("user_id", u.userId).neq("status", "archived").order("updated_at", { ascending: false }).limit(10);
  if (projectId && UUID.test(projectId)) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (missing(error)) return NextResponse.json({ ok: true, setup: true, experiments: [] });
  if (error) return NextResponse.json({ ok: false, error: "Could not load experiments." }, { status: 503 });
  const ids = (data ?? []).map((r) => r.id as string);
  // Newer columns first; if the loop migration has not been run yet, fall back so existing experiments still load.
  let evs: ExperimentEvent[] = [];
  if (ids.length) {
    const first = await admin.from("experiment_events").select(EVENT_COLS).in("experiment_id", ids).order("created_at", { ascending: true });
    const rows = first.error ? (await admin.from("experiment_events").select("id, experiment_id, who, kind, detail, created_at").in("experiment_id", ids).order("created_at", { ascending: true })).data : first.data;
    evs = (rows ?? []) as unknown as ExperimentEvent[];
  }
  const { evidence, offers } = await loadLoopRecords(admin, ids);
  // Milestones per project, so each experiment can say which one it belongs to.
  const projectIds = [...new Set((data ?? []).map((r) => r.project_id as string | null).filter((x): x is string => !!x))];
  const msByProject = new Map<string, Awaited<ReturnType<typeof loadMilestones>>>();
  await Promise.all(projectIds.map(async (pid) => { msByProject.set(pid, await loadMilestones(admin, u.userId, pid)); }));
  const experiments = await Promise.all((data ?? []).map(async (r) => {
    const events = evs.filter((e) => (e as unknown as { experiment_id: string }).experiment_id === r.id);
    const milestones = r.project_id ? msByProject.get(r.project_id as string) ?? [] : [];
    const milestone = r.milestone_id ? milestones.find((m) => m.id === r.milestone_id) ?? null : null;
    const { stage, projectStage } = await stageFor(admin, u.userId, r as { stage?: string | null; project_id?: string | null }, events, milestone?.stage);
    return { ...r, events, milestones, milestone, evidence: evidence.filter((x) => x.experiment_id === r.id), offers: offers.filter((x) => x.experiment_id === r.id), loop_stage: stage, project_stage: projectStage };
  }));
  return NextResponse.json({ ok: true, experiments });
}

export async function POST(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const p = parseNewExperiment(body);
  if (!p.ok) return NextResponse.json({ ok: false, error: p.error }, { status: 400 });
  const admin = createAdminClient();
  let projectId: string | null = null;
  if (typeof body.projectId === "string" && UUID.test(body.projectId)) {
    const { data: proj } = await admin.from("projects").select("id").eq("id", body.projectId).eq("user_id", u.userId).maybeSingle();
    if (proj) projectId = proj.id as string;
  }
  // A milestone can be attached at the start, but only one of this founder's, in the same project.
  let milestoneId: string | null = null;
  if (projectId && typeof body.milestoneId === "string" && UUID.test(body.milestoneId)) {
    milestoneId = (await loadMilestones(admin, u.userId, projectId)).find((m) => m.id === body.milestoneId)?.id ?? null;
  }
  const { data, error } = await admin.from("customer_experiments").insert({ user_id: u.userId, project_id: projectId, ...p.value, ...(milestoneId ? { milestone_id: milestoneId } : {}) }).select("*").single();
  if (missing(error)) return NextResponse.json({ ok: false, setup: true, error: "Experiments need a database migration first." }, { status: 503 });
  if (error || !data) return NextResponse.json({ ok: false, error: "Could not start that experiment." }, { status: 503 });
  return NextResponse.json({ ok: true, experiment: { ...data, events: [] } });
}

export async function PATCH(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof b.id === "string" && UUID.test(b.id) ? b.id : "";
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const decision = DECISIONS.find((d) => d === b.decision);
  if (decision) { patch.decision = decision; patch.status = "decided"; patch.decision_note = typeof b.decision_note === "string" ? b.decision_note.trim().slice(0, 300) : ""; }
  if (b.status === "archived") patch.status = "archived";
  if ("milestone_id" in b) {
    if (b.milestone_id === null || b.milestone_id === "") patch.milestone_id = null;
    else if (typeof b.milestone_id === "string" && UUID.test(b.milestone_id)) {
      const admin0 = createAdminClient();
      const { data: exp0 } = await admin0.from("customer_experiments").select("project_id").eq("id", id).eq("user_id", u.userId).maybeSingle();
      const ok = exp0?.project_id ? (await loadMilestones(admin0, u.userId, exp0.project_id as string)).some((m) => m.id === b.milestone_id) : false;
      if (!ok) return NextResponse.json({ ok: false, error: "That milestone is not in this experiment's project." }, { status: 400 });
      patch.milestone_id = b.milestone_id;
    } else return NextResponse.json({ ok: false, error: "That milestone is not valid." }, { status: 400 });
  }
  if (typeof b.stage === "string" && (LOOP_STAGES as readonly string[]).includes(b.stage)) patch.stage = b.stage;
  if (Object.keys(patch).length === 1) return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
  const { data, error } = await createAdminClient().from("customer_experiments").update(patch).eq("id", id).eq("user_id", u.userId).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 503 });
  if (!data) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, experiment: data });
}
