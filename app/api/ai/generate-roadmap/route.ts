import { NextResponse } from "next/server";
import { createUserNotification, enforceAndTrackAIUsage, groqJSON } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";

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

async function insertMilestone(
  supabase: ReturnType<typeof createAdminClient>,
  payload: Record<string, unknown>,
) {
  const payloads = [
    // Attempt 1 — rich schema used by current app
    {
      project_id: payload.project_id,
      user_id: payload.user_id,
      title: payload.title,
      stage: payload.stage,
      order_index: payload.order_index,
      status: "pending" as string,
      is_completed: payload.is_completed ?? false,
    },
    // Attempt 2 — with ordering/stage but without is_completed
    {
      project_id: payload.project_id,
      user_id: payload.user_id,
      title: payload.title,
      stage: payload.stage,
      order_index: payload.order_index,
      status: "pending" as string,
    },
    // Attempt 3 — safest: only columns guaranteed in base schema
    {
      project_id: payload.project_id,
      title: payload.title,
      status: "pending" as string,
    },
    // Attempt 4 — with user_id
    {
      project_id: payload.project_id,
      user_id: payload.user_id,
      title: payload.title,
      status: "pending" as string,
    },
    // Attempt 5 — with is_completed (post-migration)
    {
      project_id: payload.project_id,
      user_id: payload.user_id,
      title: payload.title,
      is_completed: payload.is_completed ?? false,
    },
  ];

  for (const row of payloads) {
    const result = await supabase.from("milestones").insert(row as Record<string, unknown> as never).select("id").single();
    if (!result.error && result.data?.id) return result.data;
    const message = result.error?.message?.toLowerCase() ?? "";
    if (
      !message.includes("schema cache") &&
      !message.includes("could not find") &&
      !message.includes("column") &&
      !message.includes("null value")
    ) {
      throw result.error;
    }
  }

  return null;
}

async function insertTasks(
  supabase: ReturnType<typeof createAdminClient>,
  rows: Array<Record<string, unknown>>,
) {
  if (!rows.length) return;

  const attempts = [
    // Attempt 1 — safest: only columns guaranteed to exist in base schema
    rows.map((row) => ({
      milestone_id: row.milestone_id,
      title: row.title,
      status: (row.is_completed ? "completed" : "pending") as string,
    })),
    // Attempt 2 — with user_id if available
    rows.map((row) => ({
      milestone_id: row.milestone_id,
      user_id: row.user_id,
      title: row.title,
      status: (row.is_completed ? "completed" : "pending") as string,
    })),
    // Attempt 3 — with is_completed (only works after migration 20260430000000 runs)
    rows.map((row) => ({
      milestone_id: row.milestone_id,
      user_id: row.user_id,
      title: row.title,
      is_completed: row.is_completed,
    })),
    // Attempt 4 — description fallback (very old schema)
    rows.map((row) => ({
      milestone_id: row.milestone_id,
      description: row.title,
      status: (row.is_completed ? "completed" : "pending") as string,
    })),
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await supabase.from("tasks").insert(attempt as Record<string, unknown>[] as never);
    if (!result.error) return;
    lastError = result.error;
    const message = result.error.message?.toLowerCase() ?? "";
    if (
      !message.includes("schema cache") &&
      !message.includes("could not find") &&
      !message.includes("column") &&
      !message.includes("null value")
    ) {
      throw result.error;
    }
  }
  
  // If all attempts failed, log and throw the last error so we can see what's broken
  if (lastError) {
    console.error("insertTasks: all 4 payload attempts failed. Last error:", lastError);
    throw lastError;
  }
}

export async function POST(request: Request) {
  try {
    // Authenticate first — userId from the session is authoritative.
    // Accepting userId from the body was a security hole: an unauthenticated
    // caller could drain any user's AI quota by supplying their UUID.
    const routeUser = await getRouteUser();
    if (!routeUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = routeUser.userId;

    const body = await request.json().catch(() => ({}));
    const projectId = String(body?.projectId ?? "").trim();
    const projectName = String(body?.title ?? body?.project_name ?? "Startup Project");
    const idea = String(body?.idea ?? body?.idea_description ?? "");
    const targetUsers = String(body?.targetUsers ?? body?.target_users ?? "");
    const problem = String(body?.problem ?? "");
    const initialStage = normalizeStage(body?.startup_stage ?? body?.stage ?? "Idea");

    let roadmap = FALLBACK_ROADMAP;

    try {
      await enforceAndTrackAIUsage(userId, routeUser.plan);
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
      console.error("Roadmap AI generation failed, writing fallback roadmap:", err);
      // Use fallback — project creation must still produce milestones/tasks.
    }

    // If we have a projectId, write the roadmap to Supabase directly
    if (projectId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createAdminClient();

        // Set initial stage (user can choose a later stage)
        await supabase
          .from("projects")
          .update({ startup_stage: initialStage })
          .eq("id", projectId)
          .eq("user_id", userId);

        // Delete existing milestones for clean slate
        await supabase.from("milestones").delete().eq("project_id", projectId);

        // Insert new milestones and tasks
        const milestoneIds: Array<{ id: string; title: string; order_index: number }> = [];
        for (let i = 0; i < roadmap.length; i++) {
          const milestone = roadmap[i];
          const createdMilestone = await insertMilestone(supabase, {
            project_id: projectId,
            user_id: userId,
            title: milestone.milestone,
            stage: milestone.milestone,
            order_index: i,
            is_completed: false,
          });

          if (createdMilestone?.id) {
            milestoneIds.push({ id: createdMilestone.id, title: milestone.milestone, order_index: i });
            const taskRows = (milestone.tasks ?? []).map((t) => ({
              milestone_id: createdMilestone.id,
              user_id: userId,
              title: t,
              is_completed: false,
            }));
            if (taskRows.length) {
              await insertTasks(supabase, taskRows);
            }
          }
        }

        // If user starts at a later stage, mark only the immediately previous
        // phase complete. The stored startup_stage remains authoritative and
        // broad pre-completion can make stage inference jump too far.
        const stageIndex = STAGE_ORDER.findIndex((s) => s.toLowerCase() === initialStage.toLowerCase());
        if (stageIndex > 0 && milestoneIds.length) {
          const prevMilestone = milestoneIds.find((m) => m.order_index === stageIndex - 1);
          if (prevMilestone) {
            await supabase.from("milestones").update({ status: "completed" }).eq("id", prevMilestone.id);
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
