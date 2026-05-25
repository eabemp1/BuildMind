import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InitialAnalysis = {
  transition_state: string;
  key_risks: [string, string, string];
  immediate_priorities: [string, string, string];
  health_score: number;
  founder_pattern: string;
  operating_mode: string;
  generated_at: string;
  stage: string;
};

function buildAnalysis(stage: string, projectName: string, problem: string): InitialAnalysis {
  const base = stage || "Idea";
  const riskSet: Record<string, [string, string, string]> = {
    Idea: ["Problem definition is still broad.", "User interviews are likely too shallow.", "No proof yet that the pain is urgent."],
    Validation: ["You may be over-trusting positive feedback.", "Commitment signals are weak.", "Follow-through on outreach needs to tighten."],
    MVP: ["Delivery risk is now higher than idea risk.", "Product scope may be drifting.", "Early users need a tighter feedback loop."],
    Launch: ["Visibility may be lagging the product.", "The message may be too generic.", "Retention signal needs monitoring."],
    Growth: ["Acquisition and retention may be imbalanced.", "Channel fatigue can creep in quickly.", "The bottleneck may be onboarding, not reach."],
    Revenue: ["Pricing confidence may be too low.", "Late-stage buyers need direct follow-up.", "Churn/expansion signals need attention."],
  };
  const prioritySet: Record<string, [string, string, string]> = {
    Idea: ["Talk to 3 users today.", "Sharpen the exact problem statement.", "Write the smallest testable promise."],
    Validation: ["Collect one hard commitment.", "Log the strongest objection.", "Run a follow-up ask within 24 hours."],
    MVP: ["Ship the roughest version that teaches you something.", "Watch one user in real time.", "Trim every non-essential surface."],
    Launch: ["Publish the product where your users already are.", "Measure response quality, not volume.", "Iterate the message after the first wave."],
    Growth: ["Find the cheapest repeatable acquisition loop.", "Fix the first-step drop-off.", "Protect retention before scaling spend."],
    Revenue: ["Ask for the money directly.", "Tighten pricing and packaging.", "Learn why people say no."],
  };

  return {
    transition_state: `${projectName || "This project"} is operating at ${base.toLowerCase()} stage with BuildMind watching for execution drift.`,
    key_risks: riskSet[base] ?? riskSet.Idea,
    immediate_priorities: prioritySet[base] ?? prioritySet.Idea,
    health_score: base === "Revenue" ? 72 : base === "Growth" ? 64 : base === "Launch" ? 60 : base === "MVP" ? 54 : base === "Validation" ? 46 : 38,
    founder_pattern: problem ? `Behavior is clustering around ${problem}.` : `Behavior is clustering around the current stage constraints of ${base.toLowerCase()}.`,
    operating_mode: base === "Revenue" ? "Direct-response closing mode" : base === "Growth" ? "Distribution pressure mode" : "Exploration and calibration mode",
    generated_at: new Date().toISOString(),
    stage: base,
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

    const admin = createAdminClient();
    const { data: project } = await admin
      .from("projects")
      .select("id, title, problem, startup_stage")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: memory } = await admin
      .from("founder_memory")
      .select("initial_analysis")
      .eq("user_id", user.id)
      .maybeSingle();

    const currentStage = String(project?.startup_stage ?? body?.stage ?? "Idea");
    const cached = memory?.initial_analysis ? (() => { try { return JSON.parse(memory.initial_analysis as string) as InitialAnalysis; } catch { return null; } })() : null;
    if (cached && cached.stage === currentStage) {
      return NextResponse.json({ ok: true, data: cached, cached: true });
    }

    const analysis = buildAnalysis(currentStage, project?.title ?? "", project?.problem ?? "");
    await admin.from("founder_memory").upsert({
      user_id: user.id,
      initial_analysis: JSON.stringify(analysis),
    }, { onConflict: "user_id" });

    return NextResponse.json({ ok: true, data: analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build initial analysis";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}