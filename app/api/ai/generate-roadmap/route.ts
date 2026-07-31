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

// Provisional (heuristic) estimates for stages the AI hasn't generated real
// tasks for yet — later stages beyond currentStage+1 (see detailedStages
// below). These are placeholders only, marked estimate_is_provisional so
// the UI can show them as rough, and get overwritten with a real AI
// estimate once that stage's tasks are actually generated. Confirmed gap:
// as of this migration, nothing currently regenerates a later stage's
// milestone automatically when the founder reaches it — only the manual
// "Regenerate Milestones" button (app/(dashboard)/projects/[id]/page.tsx)
// re-runs this route, wiping and recreating ALL milestones. That's a
// pre-existing behavior this change does not alter.
const PROVISIONAL_STAGE_ESTIMATES: Record<string, { difficulty: number; estimated_days: number }> = {
  Idea:       { difficulty: 2, estimated_days: 5 },
  Validation: { difficulty: 3, estimated_days: 10 },
  MVP:        { difficulty: 4, estimated_days: 21 },
  Launch:     { difficulty: 3, estimated_days: 10 },
  Growth:     { difficulty: 4, estimated_days: 30 },
  Revenue:    { difficulty: 4, estimated_days: 30 },
};

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
    // difficulty/estimated_days/estimate_is_provisional/started_at added for
    // milestone stall detection (migration 20260731000000). If that
    // migration hasn't been applied live yet, this attempt fails on
    // "column ... does not exist" and falls through to attempt 2, which
    // omits them — same drift-safety pattern already used for
    // is_completed above.
    {
      project_id: payload.project_id,
      user_id: payload.user_id,
      title: payload.title,
      stage: payload.stage,
      order_index: payload.order_index,
      status: "pending" as string,
      is_completed: payload.is_completed ?? false,
      difficulty: payload.difficulty ?? null,
      estimated_days: payload.estimated_days ?? null,
      estimate_is_provisional: payload.estimate_is_provisional ?? false,
      started_at: payload.started_at ?? null,
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
    const result = await supabase.from("milestones").insert(row as Record<string, unknown> as never).select("id").maybeSingle();
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
      priority: row.priority,
    })),
    // Attempt 2 — with user_id if available
    rows.map((row) => ({
      milestone_id: row.milestone_id,
      user_id: row.user_id,
      title: row.title,
      status: (row.is_completed ? "completed" : "pending") as string,
      priority: row.priority,
    })),
    // Attempt 3 — with is_completed (only works after migration 20260430000000 runs)
    rows.map((row) => ({
      milestone_id: row.milestone_id,
      user_id: row.user_id,
      title: row.title,
      is_completed: row.is_completed,
      priority: row.priority,
    })),
    // Attempt 4 — description fallback (very old schema, no priority column)
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

    // FIX: previously generated all 5 stages' full task lists in one call,
    // regardless of the founder's actual current stage — this is the
    // confirmed root cause of Growth-stage tasks ("partner with 3
    // accelerators", "onboard 100 founders with personalized kickoff
    // calls") appearing for a founder still at Launch. Only the current
    // stage and the one immediately after get real, detailed tasks. Later
    // stages get a milestone placeholder with zero tasks — they'll be
    // properly generated when the founder actually reaches them and has
    // real context (momentum, reflections, what worked) to generate from,
    // instead of a same-day guess made before any of that exists.
    const currentStageIdx = STAGE_ORDER.findIndex((s) => s.toLowerCase() === initialStage.toLowerCase());
    const detailedStages = STAGE_ORDER.slice(Math.max(0, currentStageIdx), currentStageIdx + 2);

    // Per-milestone difficulty (1-5) + estimated_days, keyed by same output
    // as detailedMap below. Populated only for detailedStages (the AI call
    // below); later placeholder stages fall back to PROVISIONAL_STAGE_ESTIMATES.
    let estimateMap = new Map<string, { difficulty: number; estimated_days: number }>();

    try {
      await enforceAndTrackAIUsage(userId, routeUser.plan);
      const result = await groqJSON<{
        roadmap: Array<{ milestone: string; tasks: string[]; difficulty: number; estimated_days: number }>;
      }>(
        `You are a startup execution strategist for BuildMind — a tool built specifically for SOLO founders with no team, no contractor budget, and limited hours (they are almost always doing this alongside other obligations, not full-time with hired help).

Return JSON with key "roadmap" only — an array of milestone objects for these stages ONLY: ${detailedStages.join(", ")}.
Each object has:
- "milestone" (string)
- "tasks" (array of 3-5 specific action strings)
- "difficulty" (integer 1-5: 1 = a few hours of straightforward work, 5 = weeks of hard, uncertain work with real failure risk — judge based on what this milestone actually requires for a solo founder, not generic startup difficulty)
- "estimated_days" (integer: realistic calendar days for ONE person working alone, part-time-capacity, to complete every task in this milestone — not an idealized full-time estimate)

HARD CONSTRAINTS on every task:
- Must be completable by ONE person, alone, without hiring anyone or requiring a team.
- Never suggest anything requiring a contractor, agency, hired help, or "partner with an organization" — those require capacity a solo founder doesn't have and BD timelines (months) that don't fit a daily-action tool.
- Never suggest "personalized 1:1 [X] for every user/customer" at any scale beyond a handful — that's a hiring plan disguised as a task, not an action.
- Scope every task to something achievable in hours, not weeks — if an idea is real but too big for one action, break it into the FIRST concrete step only, not the whole initiative.
- Tasks must be specific to this exact startup — not generic advice.
- estimated_days must be realistic for a solo founder juggling this alongside other obligations — do not pad for a full-time team, and do not compress to an unrealistic sprint.`,
        `Project: ${projectName}
Idea: ${idea}
Target users: ${targetUsers}
Problem: ${problem}
Founder's current stage: ${initialStage}

Generate a specific roadmap for THIS founder's current and immediate-next stage only. Tasks must reference the actual product and users, and must be realistic for one person working alone.`,
      );
      if (Array.isArray(result?.roadmap) && result.roadmap.length >= 1) {
        // Merge: detailed tasks for current+next stage, empty placeholders
        // for later stages (never silently drop a milestone from the roadmap
        // view — just don't populate tasks for stages that are premature).
        const detailedMap = new Map(result.roadmap.map((m) => [m.milestone, m.tasks]));
        estimateMap = new Map(
          result.roadmap
            .filter((m) => Number.isFinite(m.difficulty) && Number.isFinite(m.estimated_days))
            .map((m) => [
              m.milestone,
              {
                difficulty: Math.min(5, Math.max(1, Math.round(m.difficulty))),
                estimated_days: Math.max(1, Math.round(m.estimated_days)),
              },
            ]),
        );
        roadmap = STAGE_ORDER.map((stageName) => ({
          milestone: stageName,
          tasks: detailedMap.get(stageName) ?? [],
        }));
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
        const nowIso = new Date().toISOString();
        for (let i = 0; i < roadmap.length; i++) {
          const milestone = roadmap[i];
          const aiEstimate = estimateMap.get(milestone.milestone);
          const provisionalEstimate = PROVISIONAL_STAGE_ESTIMATES[milestone.milestone];
          const estimate = aiEstimate ?? provisionalEstimate ?? null;
          // Only the founder's CURRENT stage is meaningfully "started" the
          // moment the roadmap is created — the next-stage milestone exists
          // but nothing is being worked on it yet. That one gets started_at
          // stamped later, when this milestone completes and it becomes
          // current (lib/buildmind.ts updateTaskStatus — see that file for
          // the matching write). Placeholder future-stage milestones never
          // get started_at here; they're not active and shouldn't be
          // eligible for stall alerts until they are.
          const isCurrentStageMilestone = i === currentStageIdx;
          const createdMilestone = await insertMilestone(supabase, {
            project_id: projectId,
            user_id: userId,
            title: milestone.milestone,
            stage: milestone.milestone,
            order_index: i,
            is_completed: false,
            difficulty: estimate?.difficulty ?? null,
            estimated_days: estimate?.estimated_days ?? null,
            estimate_is_provisional: !aiEstimate,
            started_at: isCurrentStageMilestone ? nowIso : null,
          });

          if (createdMilestone?.id) {
            milestoneIds.push({ id: createdMilestone.id, title: milestone.milestone, order_index: i });
            // FIX: previously never set priority, so every task silently
            // got the schema default (5) — confirmed as the exact cause of
            // flat priority:5 across every row in a real founder's task
            // list. Stage distance from the founder's actual current stage
            // dominates (current-stage tasks always rank above next-stage
            // ones); position within the stage's task list breaks ties.
            // Lower number = higher priority, matching the schema default's
            // convention (DEFAULT 5, so 1 is more urgent than 5).
            const stageDistance = Math.max(0, i - Math.max(0, currentStageIdx));
            const taskRows = (milestone.tasks ?? []).map((t, taskIdx) => ({
              milestone_id: createdMilestone.id,
              user_id: userId,
              title: t,
              is_completed: false,
              priority: stageDistance * 10 + taskIdx + 1,
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
