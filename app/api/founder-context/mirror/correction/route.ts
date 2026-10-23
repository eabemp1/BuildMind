import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeBeliefKey } from "@/lib/founderMirror";
import { weighEvidence, verdictMessage } from "@/lib/evidenceWeigh";
import { loadFounderIntelligence } from "@/lib/founderIntelligence";
import { beliefSubject, findPatternStat } from "@/lib/beliefCalibration";

export const runtime = "nodejs";

const correctionSchema = z.object({
  belief: z.string().trim().min(1).max(500),
  correction: z.string().trim().min(1).max(1000),
  evidence: z.string().trim().max(1000).optional(),
  // Which specific belief this targets, as lib/founderMirror.ts's
  // normalizeBeliefKey() would key it. Omitted (or "general") means the
  // correction applies to every belief at reduced weight rather than one
  // in particular — see GENERAL_CORRECTION_WEIGHT in lib/founderMirror.ts.
  belief_key: z.string().trim().max(200).optional(),
});

// GET — the "View past corrections" list on the Founder Mirror page.
// founder_corrections has been written to by POST below since this route's
// creation; nothing previously read it back for the founder to see it again.
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: memory, error: readError } = await admin
    .from("founder_memory")
    .select("founder_corrections")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ ok: false, error: "Could not load founder memory" }, { status: 500 });

  const corrections = Array.isArray(memory?.founder_corrections) ? memory.founder_corrections : [];
  return NextResponse.json({ ok: true, corrections: [...corrections].reverse() });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const parsed = correctionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid correction" }, { status: 400 });

  const admin = createAdminClient();
  const { data: memory, error: readError } = await admin
    .from("founder_memory")
    .select("founder_corrections")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ ok: false, error: "Could not load founder memory" }, { status: 500 });

  const existing: Array<{ correction?: string; evidence?: string; created_at?: string }> =
    Array.isArray(memory?.founder_corrections) ? memory.founder_corrections : [];

  // At most 3 corrections a day: a model that rewrites itself on every tap is not a model.
  const dayAgo = Date.now() - 24 * 3600_000;
  if (existing.filter((c) => Date.parse(c.created_at ?? "") >= dayAgo).length >= 3) {
    return NextResponse.json({ ok: false, error: "That's three corrections today. Let the model absorb them, then try again tomorrow." }, { status: 429 });
  }

  // Weigh the founder's account against what BuildMind recorded itself.
  const since = new Date(Date.now() - 21 * 24 * 3600_000).toISOString();
  const [tasksRes, reflRes] = await Promise.all([
    admin.from("reflexion_learning_log").select("action_shown, action_type").eq("user_id", user.id).eq("outcome", "completed").gte("created_at", since).limit(60),
    admin.from("reflections").select("what_tried, what_happened").eq("user_id", user.id).gte("created_at", since).limit(40),
  ]);
  const observed = [
    ...((tasksRes.data ?? []) as Array<{ action_shown?: string | null; action_type?: string | null }>).map((t) => ({ text: t.action_shown ?? "", actionType: t.action_type ?? null })),
    ...((reflRes.data ?? []) as Array<{ what_tried?: string | null; what_happened?: string | null }>).map((r) => ({ text: `${r.what_tried ?? ""} ${r.what_happened ?? ""}` })),
  ];
  const weighed = weighEvidence({
    kind: "mirror_correction",
    claim: normalizeBeliefKey(parsed.data.belief_key || parsed.data.belief) === "general" || /^General Founder Mirror model$/i.test(parsed.data.belief) ? "" : parsed.data.belief,
    text: [parsed.data.correction, parsed.data.evidence].filter(Boolean).join(" "),
    observed,
    previousTexts: existing.map((c) => [c.correction, c.evidence].filter(Boolean).join(" ")),
  });
  if (weighed.verdict === "needs_more") {
    return NextResponse.json({ ok: false, needsMore: true, score: weighed.score, error: verdictMessage(weighed), hints: weighed.hints }, { status: 422 });
  }

  // Save how many related tasks existed now, so the Mirror can later show whether the correction held.
  let snapshot: { completed: number; total: number } | undefined;
  try {
    const state = await loadFounderIntelligence(admin, user.id, undefined, { agentEvidence: null });
    const stat = findPatternStat(beliefSubject(parsed.data.belief), state.founder.pattern_stats);
    if (stat && stat.total > 0) snapshot = { completed: stat.completed, total: stat.total };
  } catch { /* the correction is still saved without it */ }

  const correction = {
    ...parsed.data,
    ...(snapshot ? { snapshot } : {}),
    weight: weighed.weight,
    verified: weighed.corroborated,
    score: weighed.score,
    // Normalize once at write time so lib/founderMirror.ts's matching is a
    // straight equality check, not a re-normalization of stored data.
    belief_key: normalizeBeliefKey(parsed.data.belief_key || parsed.data.belief),
    created_at: new Date().toISOString(),
  };
  const { error: writeError } = await admin.from("founder_memory").upsert({
    user_id: user.id,
    founder_corrections: [...existing, correction].slice(-30),
    updated_at: correction.created_at,
  }, { onConflict: "user_id" });
  if (writeError) return NextResponse.json({ ok: false, error: "Could not save correction" }, { status: 500 });

  return NextResponse.json({ ok: true, correction, verdict: weighed.verdict, message: verdictMessage(weighed) });
}
