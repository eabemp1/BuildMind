import { NextResponse } from "next/server";
import { createUserNotification, enforceAndTrackAIUsage, groqJSON } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";

const FALLBACK_ROADMAP = [
  { milestone: "Idea", tasks: ["Define core value proposition in one sentence", "Draft one-line pitch", "Identify 3 competitor alternatives and what they miss"] },
  { milestone: "Validation", tasks: ["Interview 10 target users — not friends", "Validate top 3 pain points with evidence", "Test willingness to pay with 5 people"] },
  { milestone: "MVP", tasks: ["Scope MVP to exactly 3 features — cut everything else", "Ship first working prototype", "Get 5 users to complete the core flow"] },
  { milestone: "Launch", tasks: ["Prepare launch messaging — one headline only", "Post on Product Hunt", "Email every person who said they wanted this"] },
  { milestone: "Growth", tasks: ["Define the single metric that predicts retention", "Run one growth experiment per week", "Talk to churned users to understand why they left"] },
];

const STAGE_ORDER = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];

function normalizeStage(input: string): string {
  const value = String(input || "").trim().toLowerCase();
  if (value.includes("idea")) return "Idea";
  if (value.includes("valid")) return "Validation";
  if (value.includes("mvp") || value.includes("proto")) return "MVP";
  if (value.includes("launch")) return "Launch";
  if (value.includes("growth")) return "Growth";
  if (value.includes("revenue")) return "Revenue";
  return "Idea";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId ?? "").trim();
    const projectId = String(body?.projectId ?? "").trim();
    const projectName = String(body?.title ?? body?.project_name ?? "Startup Project");
    const idea = String(body?.idea ?? body?.idea_description ?? "");
    const targetUsers = String(body?.targetUsers ?? body?.target_users ?? "");
    const problem = String(body?.problem ?? "");
    const initialStage = normalizeStage(body?.startup_stage ?? body?.stage ?? "Idea");

    if (!userId) return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 });

    await enforceAndTrackAIUsage(userId);

    let roadmap = FALLBACK_ROADMAP;

    try {
      const result = await groqJSON<{ roadmap: Array<{ milestone: string; tasks: string[] }> }>(
        `You are a startup execution strategist. Return JSON with key "roadmap" only — an array of 5 milestone objects.
Each object has "milestone" (string) and "tasks" (array of 3-5 specific action strings).
Milestones must be in this exact order: Idea, Validation, MVP, Launch, Growth.
Tasks must be specific to this exact startup — not generic advice.`,
        `Project: ${projectName}
Idea: ${idea}
Target users: ${targetUsers}
Problem: ${problem}

Generate a specific roadmap for this startup. Tasks must reference the actual product and users.`,
      );
      if (Array.isArray(result?.roadmap) && result.roadmap.length >= 3) {
        roadmap = result.roadmap;
      }
    } catch (err) {
      console.error("Groq roadmap generation failed:", err);
      // Use fallback — that's fine, don't throw
    }

    // If we have a projectId, write the roadmap to Supabase directly
    if (projectId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createAdminClient();

        // Set initial stage (user can choose a later stage)
        await supabase.from("projects").update({ startup_stage: initialStage }).eq("id", projectId).eq("user_id", userId);

        // Delete existing milestones for clean slate
        await supabase.from("milestones").delete().eq("project_id", projectId);

        // Insert new milestones and tasks
        const milestoneIds: Array<{ id: string; title: string; order_index: number }> = [];
        for (let i = 0; i < roadmap.length; i++) {
          const milestone = roadmap[i];
          const { data: createdMilestone } = await supabase
            .from("milestones")
            .insert({ project_id: projectId, title: milestone.milestone, stage: milestone.milestone, order_index: i, is_completed: false })
            .select("id")
            .single();

          if (createdMilestone?.id) {
            milestoneIds.push({ id: createdMilestone.id, title: milestone.milestone, order_index: i });
            const taskRows = (milestone.tasks ?? []).map((t) => ({
              milestone_id: createdMilestone.id,
              title: t,
              is_completed: false,
            }));
            if (taskRows.length) {
              await supabase.from("tasks").insert(taskRows);
            }
          }
        }

        // If user starts at a later stage, mark earlier milestones/tasks complete
        const stageIndex = STAGE_ORDER.findIndex((s) => s.toLowerCase() === initialStage.toLowerCase());
        if (stageIndex > 0 && milestoneIds.length) {
          const toComplete = milestoneIds.filter((m) => m.order_index < stageIndex).map((m) => m.id);
          if (toComplete.length) {
            await supabase.from("milestones").update({ is_completed: true }).in("id", toComplete);
            const { data: earlyTasks } = await supabase.from("tasks").select("id").in("milestone_id", toComplete);
            if (earlyTasks?.length) {
              await supabase.from("tasks").update({ is_completed: true }).in("id", earlyTasks.map((t) => t.id));
            }
          }
        }
      } catch (dbErr) {
        console.error("Failed to write roadmap to DB:", dbErr);
        // Don't throw — return the roadmap data even if DB write failed
      }
    }

    await createUserNotification(userId, "Your AI roadmap has been generated. Check your milestones.");

    return NextResponse.json({ success: true, data: { roadmap } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Roadmap generation failed";
    const status = message.toLowerCase().includes("limit") ? 429 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
