/**
 * /api/experiments/evidence
 *   POST   { experimentId, kind, status?, note, source?, source_date?, clientKey? }   add evidence. Same clientKey twice saves once.
 *   PATCH  { id }                                                                      "I checked this again today": sets last checked
 *   DELETE { id }                                                                      remove an entry
 * Evidence entered during a test run is saved but flagged synthetic and never counted.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanId, cleanKey } from "@/lib/experiments";
import { parseEvidence } from "@/lib/experimentLoop";
import { loadTestMode } from "@/lib/testMode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COLS = "id, experiment_id, kind, status, note, source, source_date, last_checked, created_at, synthetic";
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message ?? ""));
const SETUP = { ok: false, setup: true, error: "Run 20261117000000_experiment_loop.sql in Supabase, then try again." };

export async function POST(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const experimentId = cleanId(b.experimentId);
  if (!experimentId) return NextResponse.json({ ok: false, error: "experimentId required" }, { status: 400 });
  const p = parseEvidence(b);
  if (!p.ok) return NextResponse.json({ ok: false, error: p.error }, { status: 400 });
  const clientKey = cleanKey(b.clientKey);
  const admin = createAdminClient();
  const { data: exp } = await admin.from("customer_experiments").select("id").eq("id", experimentId).eq("user_id", u.userId).maybeSingle();
  if (!exp) return NextResponse.json({ ok: false, error: "Experiment not found." }, { status: 404 });
  if (clientKey) {
    const { data: dup, error: dupErr } = await admin.from("experiment_evidence").select(COLS).eq("user_id", u.userId).eq("client_key", clientKey).maybeSingle();
    if (missing(dupErr)) return NextResponse.json(SETUP, { status: 503 });
    if (dup) return NextResponse.json({ ok: true, evidence: dup, duplicate: true });
  }
  const synthetic = await loadTestMode(admin, u.userId);
  const { data, error } = await admin.from("experiment_evidence").insert({ experiment_id: experimentId, user_id: u.userId, ...p.value, last_checked: p.value.status === "observed" ? new Date().toISOString() : null, synthetic, client_key: clientKey }).select(COLS).single();
  if (error?.code === "23505" && clientKey) {
    const { data: dup } = await admin.from("experiment_evidence").select(COLS).eq("user_id", u.userId).eq("client_key", clientKey).maybeSingle();
    if (dup) return NextResponse.json({ ok: true, evidence: dup, duplicate: true });
  }
  if (missing(error)) return NextResponse.json(SETUP, { status: 503 });
  if (error || !data) return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 503 });
  return NextResponse.json({ ok: true, evidence: data });
}

export async function PATCH(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = cleanId(b.id);
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const { data, error } = await createAdminClient().from("experiment_evidence").update({ last_checked: new Date().toISOString() }).eq("id", id).eq("user_id", u.userId).neq("kind", "assumption").select(COLS).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 503 });
  if (!data) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, evidence: data });
}

export async function DELETE(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = cleanId(b.id);
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const { error } = await createAdminClient().from("experiment_evidence").delete().eq("id", id).eq("user_id", u.userId);
  if (error) return NextResponse.json({ ok: false, error: "Could not remove that." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
