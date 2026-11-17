/**
 * /api/experiments/offers
 *   POST { experimentId, problem, solution?, availability?, scope?, proof?, price_hypothesis?, evidence_ids?, clientKey? }
 *     saves a NEW version of the offer. Earlier versions are never overwritten. Same clientKey twice saves once.
 * The offer is the founder's own text. BuildMind does not write it, and nothing here sends it anywhere.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanId, cleanKey } from "@/lib/experiments";
import { parseOffer } from "@/lib/experimentLoop";
import { loadTestMode } from "@/lib/testMode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COLS = "id, experiment_id, version, problem, solution, availability, scope, proof, price_hypothesis, evidence_ids, created_at, synthetic";
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message ?? ""));
const SETUP = { ok: false, setup: true, error: "Run 20261117000000_experiment_loop.sql in Supabase, then try again." };

export async function POST(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const experimentId = cleanId(b.experimentId);
  if (!experimentId) return NextResponse.json({ ok: false, error: "experimentId required" }, { status: 400 });
  const p = parseOffer(b);
  if (!p.ok) return NextResponse.json({ ok: false, error: p.error }, { status: 400 });
  const clientKey = cleanKey(b.clientKey);
  const admin = createAdminClient();
  const { data: exp } = await admin.from("customer_experiments").select("id").eq("id", experimentId).eq("user_id", u.userId).maybeSingle();
  if (!exp) return NextResponse.json({ ok: false, error: "Experiment not found." }, { status: 404 });
  if (clientKey) {
    const { data: dup, error: dupErr } = await admin.from("experiment_offers").select(COLS).eq("user_id", u.userId).eq("client_key", clientKey).maybeSingle();
    if (missing(dupErr)) return NextResponse.json(SETUP, { status: 503 });
    if (dup) return NextResponse.json({ ok: true, offer: dup, duplicate: true });
  }
  // Only evidence from this experiment, owned by this founder, can be linked.
  let evidenceIds = p.value.evidence_ids;
  if (evidenceIds.length) {
    const { data: ok } = await admin.from("experiment_evidence").select("id").eq("experiment_id", experimentId).eq("user_id", u.userId).in("id", evidenceIds);
    const valid = new Set((ok ?? []).map((r) => r.id as string));
    evidenceIds = evidenceIds.filter((i) => valid.has(i));
  }
  const synthetic = await loadTestMode(admin, u.userId);
  // Two quick saves can pick the same number; the unique (experiment, version) rejects one, so try the next number.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last, error: lastErr } = await admin.from("experiment_offers").select("version").eq("experiment_id", experimentId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (missing(lastErr)) return NextResponse.json(SETUP, { status: 503 });
    const version = ((last?.version as number | undefined) ?? 0) + 1;
    const { data, error } = await admin.from("experiment_offers").insert({ experiment_id: experimentId, user_id: u.userId, version, ...p.value, evidence_ids: evidenceIds, synthetic, client_key: clientKey }).select(COLS).single();
    if (!error && data) return NextResponse.json({ ok: true, offer: data });
    if (error?.code === "23505") {
      if (clientKey) {
        const { data: dup } = await admin.from("experiment_offers").select(COLS).eq("user_id", u.userId).eq("client_key", clientKey).maybeSingle();
        if (dup) return NextResponse.json({ ok: true, offer: dup, duplicate: true });
      }
      continue;
    }
    if (missing(error)) return NextResponse.json(SETUP, { status: 503 });
    break;
  }
  return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 503 });
}
