/**
 * app/api/founder-context/override/route.ts
 * POST → records a task override (not today), appends reason, decays momentum
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordActivity } from "@/lib/server/activityLog";
import { logError } from "@/lib/server/logger";

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

  // FIX (audit finding, High severity): this route previously read
  // momentum_score directly, computed momentumOnOverride() locally in JS,
  // and wrote it back with a plain upsert — the FIFTH independent,
  // disconnected momentum writer found this session (alongside
  // complete_task_atomic, reflect-action, the dedicated /streak route, and
  // the Deno scheduled-jobs decay, all already consolidated earlier).
  // This one also skipped the projects-table mirror entirely, meaning an
  // override event's momentum change would never show up on pages reading
  // the mirror — directly contributing to the "momentum differs across
  // pages" issue. momentumOnOverride(current) always resolves to the same
  // fixed signal (40 — "soft signal, not punitive", see
  // lib/momentum.ts:dailyActivitySignal), so it's passed as a constant here
  // rather than recomputed — same math, now through the shared, atomic,
  // row-locked path.
  const { data: newMomentum, error: momentumErr } = await admin.rpc("update_momentum_atomic", {
    p_user_id: user.id,
    p_project_id: projectId,
    p_signal: 40,
    p_days_since_last_update: 1,
  });
  if (momentumErr) {
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
