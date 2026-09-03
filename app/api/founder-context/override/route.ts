/**
 * app/api/founder-context/override/route.ts
 * POST → records a task override (not today), appends reason, decays momentum
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordActivity } from "@/lib/server/activityLog";
import { logError } from "@/lib/server/logger";
import { updateMomentum } from "@/lib/scorecard";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  // HITL override is a Builder-only feature (trial users get full access)
  const { getEffectivePlan } = await import("@/lib/server/plan");
  const userPlan = await getEffectivePlan(user.id);
  if (userPlan !== "builder") {
    return NextResponse.json({ ok: false, error: "Builder plan required", upgradeUrl: "/upgrade" }, { status: 403 });
  }

  const { reason = "not specified", taskText = "", projectId = null } = await req.json().catch(() => ({}));
  const admin = createAdminClient();

  const { data: ctx } = await admin
    .from("founder_context")
    .select("tasks_overridden_this_week, override_reasons, current_stage")
    .eq("user_id", user.id)
    .maybeSingle();

  // Override is a soft, non-punitive signal by design — momentumOnOverride()
  // in lib/momentum.ts always resolves to a flat 40 regardless of current
  // score ("soft signal, not punitive"; see dailyActivitySignal()), so this
  // does not derive a below-current value on purpose, not by oversight. Note
  // for anyone reconciling this against the audit doc: that doc's proposed
  // correction ("override derives a below-current signal so an override
  // cannot increase a low score") is a different design decision than what
  // lib/momentum.ts actually implements — it was not applied here, since
  // changing the signal's meaning is a product call, not a bug fix. Flag if
  // you want the punitive version instead.
  //
  // This previously called admin.rpc("update_momentum_atomic") directly,
  // duplicating the RPC-call plumbing that lib/scorecard.ts's
  // updateMomentum() already owns (the comment there calls it "the ONLY
  // function permitted to write founder_context.momentum_score" — this
  // route was the one caller still bypassing it). Routed through the shared
  // helper now so there is exactly one call site for the RPC, not two.
  let newMomentum: number | null = null;
  try {
    newMomentum = await updateMomentum(user.id, projectId, 40, 1);
  } catch (momentumErr) {
    logError("founder-context/override/momentum", momentumErr, { userId: user.id });
  }

  const newOverrides = (ctx?.tasks_overridden_this_week ?? 0) + 1;
  const reasons: string[] = [...(ctx?.override_reasons ?? []), reason].slice(-10);

  await admin.from("founder_context").upsert({
    user_id: user.id,
    tasks_overridden_this_week: newOverrides,
    override_reasons: reasons,
    // Reset consecutive streak — override breaks the chain
    consecutive_tasks_completed: 0,
  }, { onConflict: "user_id" });

  // Write to task_overrides table so pattern extractor can read it
  try {
    await admin.from("task_overrides").insert({
      user_id: user.id,
      reason,
      task_text: taskText || null,
      stage: ctx?.current_stage ?? null,
    });
  } catch {
    // Non-blocking — table may not exist yet
  }

  recordActivity(user.id, "task_overridden", { reason, taskText, stage: ctx?.current_stage ?? null }).catch(() => {});

  return NextResponse.json({ ok: true, momentum: newMomentum ?? null });
}
