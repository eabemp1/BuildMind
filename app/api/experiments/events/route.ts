/**
 * /api/experiments/events
 *   POST   { experimentId, who, kind, detail?, clientKey?, correctsId? }
 *            record something the founder confirms happened. The same clientKey twice records it once.
 *            With correctsId, this entry replaces an earlier one; the earlier one stays in the history.
 *   DELETE { id, clientKey? }   withdraw a mistaken entry. It is kept in the history, marked withdrawn, and no longer counted.
 * Entries made during a test run are saved but flagged synthetic and never counted.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanId, cleanKey, parseEvent } from "@/lib/experiments";
import { loadTestMode } from "@/lib/testMode";
import { EVENT_COLS } from "@/lib/experimentsServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const migrationNeeded = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42703" || e.code === "23514" || /column .* does not exist|check constraint|schema cache/i.test(e.message ?? ""));

export async function POST(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const experimentId = cleanId(b.experimentId);
  if (!experimentId) return NextResponse.json({ ok: false, error: "experimentId required" }, { status: 400 });
  const p = parseEvent(b);
  if (!p.ok) return NextResponse.json({ ok: false, error: p.error }, { status: 400 });
  if (p.value.kind === "retracted") return NextResponse.json({ ok: false, error: "Use remove to withdraw an entry." }, { status: 400 });
  const clientKey = cleanKey(b.clientKey);
  const correctsId = b.correctsId === undefined || b.correctsId === null ? null : cleanId(b.correctsId);
  if (b.correctsId && !correctsId) return NextResponse.json({ ok: false, error: "That entry id is not valid." }, { status: 400 });
  const admin = createAdminClient();
  const { data: exp } = await admin.from("customer_experiments").select("id").eq("id", experimentId).eq("user_id", u.userId).maybeSingle();
  if (!exp) return NextResponse.json({ ok: false, error: "Experiment not found." }, { status: 404 });

  // A retry with the same key returns the entry already saved.
  if (clientKey) {
    const { data: dup } = await admin.from("experiment_events").select(EVENT_COLS).eq("user_id", u.userId).eq("client_key", clientKey).maybeSingle();
    if (dup) return NextResponse.json({ ok: true, event: dup, duplicate: true });
  }
  if (correctsId) {
    const { data: orig } = await admin.from("experiment_events").select("id").eq("id", correctsId).eq("experiment_id", experimentId).eq("user_id", u.userId).maybeSingle();
    if (!orig) return NextResponse.json({ ok: false, error: "The entry to correct was not found." }, { status: 404 });
  }
  const synthetic = await loadTestMode(admin, u.userId);
  const { data, error } = await admin.from("experiment_events").insert({ experiment_id: experimentId, user_id: u.userId, ...p.value, client_key: clientKey, corrects_id: correctsId, synthetic }).select(EVENT_COLS).single();
  if (error && error.code === "23505") {
    // Lost a race with an identical retry, or that entry was already corrected.
    if (clientKey) {
      const { data: dup } = await admin.from("experiment_events").select(EVENT_COLS).eq("user_id", u.userId).eq("client_key", clientKey).maybeSingle();
      if (dup) return NextResponse.json({ ok: true, event: dup, duplicate: true });
    }
    return NextResponse.json({ ok: false, error: "That entry was already corrected. Reload to see the latest." }, { status: 409 });
  }
  if (migrationNeeded(error)) return NextResponse.json({ ok: false, setup: true, error: "Run 20261117000000_experiment_loop.sql in Supabase, then try again." }, { status: 503 });
  if (error || !data) return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 503 });
  await admin.from("customer_experiments").update({ updated_at: new Date().toISOString() }).eq("id", experimentId).eq("user_id", u.userId);
  return NextResponse.json({ ok: true, event: data });
}

export async function DELETE(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = cleanId(b.id);
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const clientKey = cleanKey(b.clientKey);
  const admin = createAdminClient();
  const { data: orig } = await admin.from("experiment_events").select("id, experiment_id, who").eq("id", id).eq("user_id", u.userId).maybeSingle();
  if (!orig) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const { error } = await admin.from("experiment_events").insert({ experiment_id: orig.experiment_id, user_id: u.userId, who: orig.who, kind: "retracted", detail: "Withdrawn by the founder", client_key: clientKey, corrects_id: id, synthetic: false });
  if (error && error.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  if (migrationNeeded(error)) return NextResponse.json({ ok: false, setup: true, error: "Run 20261117000000_experiment_loop.sql in Supabase, then try again." }, { status: 503 });
  if (error) return NextResponse.json({ ok: false, error: "Could not remove that." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
