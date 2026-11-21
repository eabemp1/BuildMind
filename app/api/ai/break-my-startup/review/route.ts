/**
 * POST /api/ai/break-my-startup/review — the final review of a finished report, as its own request with its own time budget.
 * Body: { runId }. The report and the idea are read from the saved run, never from the request, so the review only ever sees
 * what was really saved for this founder. A report that is already reviewed is returned as it is, and a report that
 * has had MAX_REVIEWS review calls is not sent to the model again, so retries cannot run up the bill.
 * The review model (GPT-6.2 Astra by default) checks every claim against the evidence the report gathered. It has no fallback
 * model: if it cannot answer in time the report comes back labelled "Partial: not reviewed", with only the no-model rules applied.
 * Unsupported claims are removed in both cases. The result is saved onto the run when `runId` is given.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { callOpenAIStrict, REVIEW_MODEL, reviewEnabled } from "@/lib/ai-providers";
import { createAdminClient } from "@/lib/supabase/admin";
import { agentCounts, applyReview, claimsOf, dossierOf, labelFor, REVIEW_SCHEMA, reviewPrompt, type Judgement, type ReviewBlock, type ReviewStatus } from "@/lib/break/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const UUID = /^[0-9a-f-]{36}$/i;
const MAX_BODY = 200_000;
/** The review model gets its own allowance. The route limit is 60s; this leaves time to read the answer and save. */
const REVIEW_TIMEOUT_MS = 45_000;
/** Review-model calls allowed per report: the first, and one retry. */
const MAX_REVIEWS = Math.max(1, Number(process.env.OPENAI_REVIEW_MAX) || 2);

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { runId?: unknown };
  const runId = typeof b.runId === "string" && UUID.test(b.runId) ? b.runId : null;
  if (!runId) return NextResponse.json({ ok: false, error: "Save the run first, then review it." }, { status: 400 });
  if (user.plan === "free" || !hasAdminEnv()) return NextResponse.json({ ok: false, error: "Only a full report can be reviewed." }, { status: 400 });

  const admin = createAdminClient();
  const { data: row } = await admin.from("break_runs").select("idea, payload").eq("id", runId).eq("user_id", user.userId).maybeSingle();
  const saved = (row as { idea: string | null; payload: Record<string, unknown> | null } | null);
  const data = saved?.payload;
  if (!saved || !data || data.gated) return NextResponse.json({ ok: false, error: "Only a full report can be reviewed." }, { status: 404 });
  const idea = saved.idea ?? "";
  const prev = (data.review ?? {}) as Partial<ReviewBlock>;
  const attempts = Number(prev.attempts) || 0;

  // Already reviewed, or out of review calls: give back what is saved without calling the model.
  if (prev.status === "reviewed" || attempts >= MAX_REVIEWS) {
    const review = { ...(prev as ReviewBlock), reason: prev.status === "reviewed" ? prev.reason ?? null : `Review limit reached for this report (${MAX_REVIEWS} attempts).` };
    return NextResponse.json({ ok: true, data: { ...data, review }, review, capped: prev.status !== "reviewed" });
  }

  const dossier = dossierOf(data, idea);
  const claims = claimsOf(data);
  const agents = agentCounts(data);
  const enabled = reviewEnabled();
  let status: ReviewStatus = enabled ? "partial" : "unavailable";
  let judgement: Judgement | null = null;
  let ms: number | null = null, actual: string | null = null, reason: string | null = enabled ? null : "review model not configured";
  let called = 0;

  if (enabled && claims.length > 0) {
    called = 1;
    const r = await callOpenAIStrict<Judgement>([{ role: "user", content: reviewPrompt(dossier, claims) }], { model: REVIEW_MODEL, maxTokens: 4000, timeoutMs: REVIEW_TIMEOUT_MS, schema: REVIEW_SCHEMA as unknown as { name: string; schema: Record<string, unknown> } });
    ms = r.ms; reason = r.reason ?? null;
    if (r.ok && r.value && Array.isArray(r.value.claims)) { judgement = r.value; actual = r.actual; }
  }

  const applied = applyReview(data, dossier, judgement);
  // Reviewed only if the model answered for every claim. A half answer is a partial review, never a clean verdict.
  if (judgement) {
    if (applied.unjudged === 0) status = "reviewed";
    else { status = "partial"; reason = `${REVIEW_MODEL} did not answer for ${applied.unjudged} claim(s)`; }
  }
  const review: ReviewBlock = {
    status, agents, attempts: attempts + called,
    requested_model: enabled ? REVIEW_MODEL : null, actual_model: actual, ms, reason,
    removed_by_model: applied.removedByModel, removed_by_rule: applied.removedByRule,
    missing_evidence: (judgement?.missing_evidence ?? []).filter((x) => typeof x === "string").slice(0, 3).map((x) => x.slice(0, 200)),
    label: labelFor(status, REVIEW_MODEL, agents),
  };
  console.info("[bms-review]", JSON.stringify({ runId, status, requested: review.requested_model, actual, ms, reason, attempts: review.attempts, agents, claims: claims.length, removedByModel: applied.removedByModel, removedByRule: applied.removedByRule, unjudged: applied.unjudged, inputChars: dossier.length }));

  const reviewed = { ...applied.data, review };
  try { await admin.from("break_runs").update({ payload: reviewed }).eq("id", runId).eq("user_id", user.userId); } catch { /* the page still has the result */ }
  return NextResponse.json({ ok: true, data: reviewed, review });
}
