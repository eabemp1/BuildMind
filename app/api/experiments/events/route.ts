/**
 * /api/experiments/events
 *   POST   { experimentId, who, kind, detail? }   record something the founder confirms happened
 *   DELETE { id }                                  remove a mistaken entry, so the record stays true
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseEvent } from "@/lib/experiments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const experimentId = typeof b.experimentId === "string" && UUID.test(b.experimentId) ? b.experimentId : "";
  if (!experimentId) return NextResponse.json({ ok: false, error: "experimentId required" }, { status: 400 });
  const p = parseEvent(b);
  if (!p.ok) return NextResponse.json({ ok: false, error: p.error }, { status: 400 });
  const admin = createAdminClient();
  const { data: exp } = await admin.from("customer_experiments").select("id").eq("id", experimentId).eq("user_id", u.userId).maybeSingle();
  if (!exp) return NextResponse.json({ ok: false, error: "Experiment not found." }, { status: 404 });
  const { data, error } = await admin.from("experiment_events").insert({ experiment_id: experimentId, user_id: u.userId, ...p.value }).select("id, experiment_id, who, kind, detail, created_at").single();
  if (error || !data) return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 503 });
  await admin.from("customer_experiments").update({ updated_at: new Date().toISOString() }).eq("id", experimentId).eq("user_id", u.userId);
  return NextResponse.json({ ok: true, event: data });
}

export async function DELETE(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof b.id === "string" && UUID.test(b.id) ? b.id : "";
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const { error } = await createAdminClient().from("experiment_events").delete().eq("id", id).eq("user_id", u.userId);
  if (error) return NextResponse.json({ ok: false, error: "Could not remove that." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
