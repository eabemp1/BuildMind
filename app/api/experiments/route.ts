/**
 * /api/experiments
 *   GET    ?projectId=   the founder's experiments, newest first, each with its events
 *   POST   { goal, hypothesis?, audience?, plan?, projectId? }   start one
 *   PATCH  { id, decision?, decision_note?, status? }            record the decision, or archive
 * Needs supabase/migrations/20261116000000_customer_experiments.sql. Without it the answer says "setup".
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { DECISIONS, parseNewExperiment } from "@/lib/experiments";

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
  const { data: evs } = ids.length ? await admin.from("experiment_events").select("id, experiment_id, who, kind, detail, created_at").in("experiment_id", ids).order("created_at", { ascending: true }) : { data: [] };
  const experiments = (data ?? []).map((r) => ({ ...r, events: (evs ?? []).filter((e) => e.experiment_id === r.id) }));
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
  const { data, error } = await admin.from("customer_experiments").insert({ user_id: u.userId, project_id: projectId, ...p.value }).select("*").single();
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
  if (Object.keys(patch).length === 1) return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
  const { data, error } = await createAdminClient().from("customer_experiments").update(patch).eq("id", id).eq("user_id", u.userId).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 503 });
  if (!data) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, experiment: data });
}
