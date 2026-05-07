/**
 * app/api/founder-context/override/route.ts
 * POST → records a task override (not today), appends reason, decays momentum
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { momentumOnOverride } from "@/lib/founderContext";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  // HITL override is a Builder-only feature
  const { getFreshPlanForUser } = await import("@/lib/server/plan");
  const userPlan = await getFreshPlanForUser(user);
  if (userPlan !== "builder") {
    return NextResponse.json({ ok: false, error: "Builder plan required", upgradeUrl: "/upgrade" }, { status: 403 });
  }

  const { reason = "not specified", taskText = "" } = await req.json().catch(() => ({}));
  const admin = createAdminClient();

  const { data: ctx } = await admin
    .from("founder_context")
    .select("momentum_score, tasks_overridden_this_week, override_reasons, current_stage")
    .eq("user_id", user.id)
    .single();

  const current = ctx?.momentum_score ?? 50;
  const newMomentum = momentumOnOverride(current);
  const newOverrides = (ctx?.tasks_overridden_this_week ?? 0) + 1;
  const reasons: string[] = [...(ctx?.override_reasons ?? []), reason].slice(-10);

  await admin.from("founder_context").upsert({
    user_id: user.id,
    momentum_score: newMomentum,
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

  return NextResponse.json({ ok: true, momentum: newMomentum });
}
