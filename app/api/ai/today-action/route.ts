import { NextResponse } from "next/server";
import { enforceAndTrackAIUsage, hasAdminEnv, logReflexionQuality } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { runReflexionLoop, getWeeklyCriticPersona } from "@/lib/reflexion";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { inferStage } from "@/lib/stages";

type TodayAction = {
  action: string;        // Concrete task with platform, user type, count, and context
  platform: string;      // Exact platform: "WhatsApp", "LinkedIn", "Email", "In person", etc.
  target_user: string;   // Specific person type from their target_users field
  message: string;       // Ready-to-send script or message they can copy-paste
  why: string;           // 1-2 sentences referencing their actual stage + situation
  time: string;          // Realistic time estimate
};

type ReflexionStatus = "ok" | "partial" | "failed";

/** Build a project-specific fallback using real project data — never placeholder text */
function buildContextualFallback(stage: string, targetUsers: string, problem: string, title: string): TodayAction {
  const userType = targetUsers?.trim() || "potential users";
  const problemDesc = problem?.trim() || "this problem";
  const productName = title?.trim() || "your product";

  const fallbacks: Record<string, TodayAction> = {
    Idea: {
      action: `Message 3 ${userType} today — no pitch, just ask about ${problemDesc}.`,
      platform: "WhatsApp or LinkedIn",
      target_user: userType,
      message: `Hi [Name], quick question — what's your biggest frustration with ${problemDesc}? I'm researching it and would love 10 minutes of your time.`,
      why: `Every assumption you have about ${userType} is probably wrong. Three real conversations will invalidate more in an hour than a week of planning.`,
      time: "1 hour",
    },
    Validation: {
      action: `Send 5 personal DMs to ${userType} — ask about their workflow, not your idea.`,
      platform: "LinkedIn or WhatsApp",
      target_user: userType,
      message: `Hi [Name], I'm looking into how ${userType} handle ${problemDesc}. What do you currently do when that happens? (No pitch — genuinely curious)`,
      why: `The Mom Test: ask about their life, not your idea. ${userType} will tell you the truth when you're not selling.`,
      time: "1–2 hours",
    },
    MVP: {
      action: `Share ${productName} with 2 ${userType} and watch them use it — don't explain anything.`,
      platform: "Screen share or in person",
      target_user: userType,
      message: `Hi [Name], I've built something rough to solve ${problemDesc}. Would you try it for 10 minutes while I watch? I need to see where it breaks.`,
      why: `The version they see today teaches you more than 3 more days of polishing. Their confusion is your roadmap.`,
      time: "45 minutes",
    },
    Launch: {
      action: `Post ${productName} in one community where ${userType} gather — write one honest sentence about ${problemDesc}.`,
      platform: "Twitter/X, LinkedIn, or a relevant Slack/Discord",
      target_user: userType,
      message: `Built ${productName} to fix ${problemDesc} for ${userType}. It's live. Try it and tell me what's broken: [link]`,
      why: `You don't need to be ready — you need to be visible. An imperfect post today beats a perfect one next week.`,
      time: "30 minutes",
    },
    Growth: {
      action: `Call one ${userType} who stopped using ${productName} — ask why, don't defend.`,
      platform: "Phone call or WhatsApp voice note",
      target_user: userType,
      message: `Hi [Name], I noticed you stopped using ${productName}. No sales pitch — I just want to understand what didn't work for you. 10 minutes?`,
      why: `One churned ${userType} will teach you more than 10 new signups about what's actually broken.`,
      time: "45 minutes",
    },
    Revenue: {
      action: `Send a direct pricing message to 3 ${userType} who've been active — ask if they'd pay.`,
      platform: "WhatsApp or Email",
      target_user: userType,
      message: `Hi [Name], I'm considering charging for ${productName}. Would [price] feel fair for what you get? Be honest — it helps me get this right.`,
      why: `Willingness-to-pay conversations are the only signal that matters at revenue stage. Three honest answers beat 100 analytics events.`,
      time: "30 minutes",
    },
  };

  return fallbacks[stage] ?? fallbacks["Idea"];
}

export async function POST(request: Request) {
  try {
    // Authenticate session first — userId in body must match the session user
    const routeUser = await getRouteUser();
    if (!routeUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId ?? routeUser.userId).trim();
    const projectId = String(body?.projectId ?? "").trim();
    // Input length limits — prevent prompt injection and runaway token costs
    const providedStage = String(body?.stage ?? "").trim().slice(0, 50);
    // Client-side pending context (fast path — avoids extra DB round trip)
    const clientPendingMilestones: string[] = Array.isArray(body?.pendingMilestones)
      ? (body.pendingMilestones as unknown[]).map(s => String(s).slice(0, 100)).slice(0, 5)
      : [];
    const clientPendingTasks: string[] = Array.isArray(body?.pendingTasks)
      ? (body.pendingTasks as unknown[]).map(s => String(s).slice(0, 100)).slice(0, 5)
      : [];
    const clientCompletionRate = typeof body?.completionRate === "number" ? body.completionRate : null;

    // Prevent one user from fetching another user's project data
    if (userId !== routeUser.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!userId || !projectId) {
      return NextResponse.json({ success: false, error: "userId and projectId required" }, { status: 400 });
    }

    await enforceAndTrackAIUsage(userId, routeUser.plan);

    let projectContext = "";
    let stage = providedStage || "Idea";
    let targetUsers = "";
    let problem = "";
    let title = "";
    let lastReflectionContext = "";

    if (hasAdminEnv()) {
      const supabase = createAdminClient();

      // Fetch project, founder_memory, and last reflection in parallel
      const [projectResult, memoryResult] = await Promise.allSettled([
        supabase
          .from("projects")
          .select("name, title, description, target_users, problem, startup_stage")
          .eq("id", projectId)
          .eq("user_id", userId)
          .single(),
        supabase
          .from("founder_memory")
          .select("avoidance_zones, strengths, personality_tags, last_insight, cofounder_style")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      const project = projectResult.status === "fulfilled" ? projectResult.value.data : null;
      const memory = memoryResult.status === "fulfilled" ? memoryResult.value.data : null;

      const { data: milestones } = await supabase
        .from("milestones")
        .select("id, title, status")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      const milestoneIds = (milestones ?? []).map((m) => m.id);
      
      // Batch milestone IDs to avoid URL length limits
      let allTasks: Array<{ title: string; is_completed: boolean; milestone_id: string }> = [];
      if (milestoneIds.length > 0) {
        const BATCH_SIZE = 20;
        const batches = [];
        for (let i = 0; i < milestoneIds.length; i += BATCH_SIZE) {
          const batchIds = milestoneIds.slice(i, i + BATCH_SIZE);
          const tasksQuery = supabase.from("tasks").select("title, is_completed, milestone_id");
          batches.push(
            batchIds.length === 1
              ? tasksQuery.eq("milestone_id", batchIds[0])
              : tasksQuery.in("milestone_id", batchIds)
          );
        }
        const batchResults = await Promise.all(batches);
        for (const result of batchResults) {
          if (result.data) allTasks = allTasks.concat(result.data);
        }
      }
      const { data: tasks } = { data: allTasks };

      const completedTasks = (tasks ?? []).filter((t) => t.is_completed).length;
      const totalTasks = (tasks ?? []).length;
      const completedMilestones = (milestones ?? []).filter((m) => m.status === 'completed').length;

      if (project) {
        stage = project.startup_stage ?? inferStage(completedTasks, totalTasks, completedMilestones, (milestones ?? []).length);
        targetUsers = project.target_users ?? "";
        problem = project.problem ?? "";
        title = (project.name ?? project.title) ?? "";
        const pendingMilestonesList = (milestones ?? [])
          .filter((m) => m.status !== "completed")
          .map((m) => m.title)
          .slice(0, 5);
        const pendingTasksList = (tasks ?? [])
          .filter((t) => !t.is_completed)
          .map((t) => t.title)
          .slice(0, 5);
        const completionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        projectContext = `
Project: ${project.name ?? project.title}
Stage: ${stage}
Problem: ${project.problem ?? "Not specified"}
Target users: ${project.target_users ?? "Not specified"}
Description: ${project.description ?? "Not specified"}
Overall progress: ${completedTasks}/${totalTasks} tasks done (${completionPct}%), ${completedMilestones}/${(milestones ?? []).length} milestones complete
Pending milestones (next to tackle): ${pendingMilestonesList.length ? pendingMilestonesList.join(", ") : "None"}
Next open tasks: ${pendingTasksList.length ? pendingTasksList.join(", ") : "None"}`;
      }

      // ── Founder memory context — informs task assignment ─────────────────
      // Avoidance zones: if the natural next task falls in an avoidance zone,
      // the prompt must name it and push through it, not route around it.
      if (memory) {
        const avoidance = (memory.avoidance_zones ?? []) as string[];
        const strengths = (memory.strengths ?? []) as string[];
        const lastInsight = memory.last_insight as string | null;

        if (avoidance.length || strengths.length || lastInsight) {
          lastReflectionContext += `\n\nFOUNDER MEMORY (behavioral profile — use to shape the task):`;
          if (avoidance.length) {
            lastReflectionContext += `\nConsistently avoids: ${avoidance.join(", ")}`;
            lastReflectionContext += `\n→ If today's best task falls in an avoidance zone, name the pattern directly and assign it anyway. Don't route around it.`;
          }
          if (strengths.length) {
            lastReflectionContext += `\nStrong at: ${strengths.join(", ")} — lean on these where relevant`;
          }
          if (lastInsight) {
            lastReflectionContext += `\nLast observed pattern: "${lastInsight}"`;
          }
        }
      }

      const { data: lastReflection } = await supabase
        .from("reflections")
        .select("outcome, note, confidence, today_action, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastReflection) {
        const reflectDate = new Date(lastReflection.created_at).toLocaleDateString();
        lastReflectionContext = `
LAST REFLECTION (${reflectDate}):
Yesterday's action: "${lastReflection.today_action ?? "Not recorded"}"
Outcome: ${lastReflection.outcome}
Confidence (1-5): ${lastReflection.confidence}
Their note: "${lastReflection.note ?? "No note"}"

INSTRUCTION: Use this to make today's action a direct causal response to yesterday.
- blocked outcome -> remove that specific blocker first
- completed outcome -> go one level deeper on the same thread
- confidence 1-2 -> give an easier, confidence-building first step
- learned outcome -> apply the insight to one real person today` + lastReflectionContext;
      }
    }

    // Build contextual fallback using real project data (never placeholder text)
    const fallback = buildContextualFallback(stage, targetUsers, problem, title);

    // Fix #3: Removed pre-call groqJSON — was wasting 1-2 extra Groq calls per load.
    // Context is fed directly into Agent A as the seed. Reflexion loop (Gen→Crit→Refine)
    // runs once. This cuts 4-6 calls/load down to 2-3, more than doubling free-tier endurance.
    const criticPersona = getWeeklyCriticPersona();
    const reflexionContext: import("@/lib/reflexion").ReflexionContext = {
      startupSummary: projectContext || `${title} — ${problem || "early stage startup"}`,
      stage,
      problem: problem || undefined,
      targetUsers: targetUsers || undefined,
      momentumScore: 50,
      avoidanceSignals: [],
      cognitiveLoad: "fresh",
    };

    // Enrich context with founder memory and last reflection if available
    if (hasAdminEnv()) {
      const supabase = createAdminClient();
      const [memRes, reflRes] = await Promise.allSettled([
        supabase.from("founder_memory")
          .select("avoidance_zones, strengths, personality_tags, last_insight")
          .eq("user_id", userId).maybeSingle(),
        supabase.from("reflections")
          .select("outcome, note, confidence")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (memRes.status === "fulfilled" && memRes.value.data) {
        const m = memRes.value.data;
        reflexionContext.avoidanceSignals = (m.avoidance_zones ?? []) as string[];
      }
      if (reflRes.status === "fulfilled" && reflRes.value.data) {
        const r = reflRes.value.data;
        reflexionContext.lastReflection = {
          outcome: r.outcome ?? "unknown",
          note: r.note ?? "",
          confidence: r.confidence ?? 3,
        };
      }
    }

    // Build seed from founder context directly — no pre-call needed
    const taskSeed = [
      `Stage: ${stage}`,
      `Problem: ${problem || "Not specified"}`,
      `Target users: ${targetUsers || "Not specified"}`,
      lastReflectionContext ? `Last reflection: ${lastReflectionContext}` : "",
    ].filter(Boolean).join("\n");

    let reflexionOutput: Awaited<ReturnType<typeof runReflexionLoop>> | null = null;
    let reflexionStatus: ReflexionStatus = "partial";
    try {
      reflexionOutput = await runReflexionLoop(taskSeed, reflexionContext);
      reflexionStatus = reflexionOutput ? "ok" : "partial";
    } catch (err) {
      reflexionStatus = "failed";
      console.error("[reflexion] today-action failed:", err);
      // Reflexion loop failure is non-fatal — use single-pass result
    }

    // ── Merge reflexion output back into TodayAction shape ─────────────────
    const finalResult: TodayAction & {
      reflexion?: {
        verdict: string;
        criticPersona: string;
        rationale: string;
        loopRan: boolean;
        passedCritic: boolean;
        lastReflectionUsed: boolean;
      };
    } = {
      ...fallback,
      // If reflexion ran, its rationale becomes the task's why
      why: reflexionOutput?.rationale ?? fallback.why,
    };

    if (reflexionOutput) {
      finalResult.reflexion = {
        verdict: reflexionOutput.verdict ?? "pass",
        criticPersona: criticPersona.name,
        rationale: reflexionOutput.rationale,
        loopRan: true,
        passedCritic: reflexionOutput.verdict !== "fail",
        lastReflectionUsed: Boolean(reflexionContext.lastReflection),
      };
    }

    // ── Gatekeeper quality log ──────────────────────────────────────────────
    if (hasAdminEnv() && finalResult.action) {
      logReflexionQuality({
        userId,
        projectId,
        context: "today_action",
        finalOutput: finalResult.action,
        stage,
        targetUsers,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, data: { ...finalResult, stage, reflexion_status: reflexionStatus } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Today action failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
