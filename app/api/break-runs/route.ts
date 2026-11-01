/**
 * /api/break-runs — history of Break My Startup stress tests.
 *   GET            list (newest first), summaries only
 *   GET ?id=       one full run, to reopen without calling the AI again
 *   POST {idea, projectId?, data}   keep a finished run
 *   DELETE ?id=    remove one
 * Every query is scoped to the signed-in founder.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_PAYLOAD = 200_000;
const KEEP = 50;

export async function GET(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: true, runs: [], setup: true });
  const admin = createAdminClient();
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
    const { data } = await admin.from("break_runs").select("id, idea, project_id, payload, created_at").eq("id", id).eq("user_id", user.userId).maybeSingle();
    return data ? NextResponse.json({ ok: true, run: data }) : NextResponse.json({ ok: false }, { status: 404 });
  }
  const { data, error } = await admin
    .from("break_runs")
    .select("id, idea, verdict, survival, created_at")
    .eq("user_id", user.userId)
    .order("created_at", { ascending: false })
    .limit(KEEP);
  return NextResponse.json({ ok: true, setup: Boolean(error), runs: error ? [] : data ?? [] });
}

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { idea?: unknown; projectId?: unknown; data?: unknown };
  const idea = typeof body.idea === "string" ? body.idea.trim().slice(0, 4000) : "";
  const data = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : null;
  if (!idea || !data || JSON.stringify(data).length > MAX_PAYLOAD) return NextResponse.json({ ok: false }, { status: 400 });
  const projectId = typeof body.projectId === "string" && UUID.test(body.projectId) ? body.projectId : null;
  const survival = typeof data.survival_probability === "number" ? Math.round(data.survival_probability) : null;
  const verdict = typeof data.verdict === "string" ? data.verdict.slice(0, 300) : null;
  const { data: row, error } = await createAdminClient()
    .from("break_runs")
    .insert({ user_id: user.userId, project_id: projectId, idea, verdict, survival, payload: data })
    .select("id")
    .single();
  return NextResponse.json({ ok: !error, id: row?.id ?? null });
}

export async function DELETE(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  const { error } = await createAdminClient().from("break_runs").delete().eq("id", id).eq("user_id", user.userId);
  return NextResponse.json({ ok: !error });
}
