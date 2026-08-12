/**
 * app/api/founder-context/swap-action/route.ts
 * POST → founder tapped an alternative on the Today card instead of the
 *        deterministic top candidate. Repoints the still-pending Founder
 *        Intelligence prediction (see lib/learningLoop.ts recordFounderIntelligencePrediction)
 *        at the chosen candidate, so:
 *          1. reflect-action's later outcome comparison scores the founder's
 *             actual choice, not the recommendation they turned down.
 *          2. Thompson Sampling in lib/founderIntelligence.ts scoreCandidate()
 *             gets a real data point for the archetype the founder picked
 *             instead of that success/failure silently attaching to the
 *             wrong candidate_id.
 * Fire-and-forget from the client — this never blocks the swap from
 * appearing in the UI, it just keeps the learning loop honest in the
 * background.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { swapPredictionCandidate } from "@/lib/learningLoop";
import type { DecisionCandidate } from "@/lib/founderIntelligence";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const candidate = body?.candidate as Partial<DecisionCandidate> | undefined;

  // Minimal shape check — we only strictly need id/action/expected_evidence
  // for swapPredictionCandidate to do anything useful; scores/rationale are
  // used if present but not required, so a slightly stale client payload
  // shape doesn't fail this outright.
  if (!candidate?.id || !candidate?.action) {
    return NextResponse.json({ ok: false, reason: "missing candidate id/action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const fullCandidate: DecisionCandidate = {
    id: candidate.id,
    action: candidate.action,
    rationale: candidate.rationale ?? "",
    expected_evidence: candidate.expected_evidence ?? "",
    supporting_signals: candidate.supporting_signals ?? [],
    why_it_beats_alternatives: candidate.why_it_beats_alternatives ?? "",
    scores: candidate.scores ?? {
      impact: 50, urgency: 50, goal_relevance: 50, evidence_value: 50, founder_fit: 50,
      execution_probability: 50, opportunity_cost: 50, repetition_penalty: 0,
      behavioral_correction: 50, risk_reduction: 50, confidence: 50, total: 50,
    },
  };

  const swapped = await swapPredictionCandidate(admin, { userId: user.id, candidate: fullCandidate });

  // One decision authority: repoint today's cached decision at the
  // founder's actual choice, so Coach and any other surface reading
  // founder_context.decision_cache today see this swap, not the original
  // top candidate. Fire-and-forget — never blocks the swap from showing.
  void (async () => {
    const { data: row } = await admin.from("founder_context").select("decision_cache, decision_cache_date").eq("user_id", user.id).maybeSingle();
    const todayDateStr = new Date().toISOString().slice(0, 10);
    if (row?.decision_cache_date !== todayDateStr) return; // no same-day cache to update — next load will compute fresh anyway
    const cached = row.decision_cache as { candidates?: DecisionCandidate[]; top_candidate?: DecisionCandidate; decision_basis?: string[] } | null;
    if (!cached) return;
    await admin.from("founder_context").update({
      decision_cache: { ...cached, top_candidate: fullCandidate },
    }).eq("user_id", user.id);
  })().catch(() => {});

  // Whether or not there was a pending row to repoint (there might not be,
  // e.g. if the founder already reflected on today's action earlier and is
  // now revisiting the page), the swap itself is purely a client-side
  // display change — this endpoint only keeps the learning data honest, it
  // never gates the UI.
  return NextResponse.json({ ok: true, swapped });
}
