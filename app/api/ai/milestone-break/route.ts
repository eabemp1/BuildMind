import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MilestoneBreakResult = {
  trigger: "milestone_complete" | "stage_transition";
  triggerLabel: string;
  brutal_points: [string, string, string];
  recommended_action: string;
  generated_at: string;
};

function buildResult(triggerType: MilestoneBreakResult["trigger"], previousStage: string, currentStage: string): MilestoneBreakResult {
  const isTransition = triggerType === "stage_transition";
  return {
    trigger: triggerType,
    triggerLabel: isTransition ? `${previousStage || "Previous"} → ${currentStage || "Current"}` : "Milestone completed",
    brutal_points: isTransition
      ? [
          `You moved from ${previousStage || "one stage"} to ${currentStage || "the next stage"}, so the old task system is now obsolete.`,
          `If this shift was triggered late, the real problem is execution latency, not planning.`,
          `The next phase demands fewer tasks and more direct evidence.`,
        ]
      : [
          "You hit a milestone, but milestones are only useful if the next move is sharper.",
          "Do not let completion become false confidence.",
          "The next risk now matters more than the last win.",
        ],
    recommended_action: isTransition
      ? `Build the first task for ${currentStage || "the new stage"} around the biggest risk that became visible after the transition.`
      : "Lock in the learning from this milestone by validating the next riskiest assumption within 24 hours.",
    generated_at: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const projectId = String(body?.projectId ?? "").trim();
    if (!projectId) return NextResponse.json({ ok: false, error: "projectId required" }, { status: 400 });

    const previousStage = String(body?.previousStage ?? "");
    const currentStage = String(body?.currentStage ?? "");
    const triggerType = (body?.triggerType === "milestone_complete" ? "milestone_complete" : "stage_transition") as MilestoneBreakResult["trigger"];

    const admin = createAdminClient();
    const result = buildResult(triggerType, previousStage, currentStage);
    await admin.from("founder_memory").upsert({
      user_id: user.id,
      pending_milestone_break: JSON.stringify(result),
    }, { onConflict: "user_id" });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate milestone break";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}