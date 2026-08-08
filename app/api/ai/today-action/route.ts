import { NextResponse } from "next/server";
import { enforceAndTrackAIUsage, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { runReflexionLoop, getWeeklyCriticPersona, type ReflexionContext } from "@/lib/reflexion";
import { buildCofounderJudgment } from "@/lib/cofounderJudgment";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { logError, generateRequestId } from "@/lib/server/logger";
import { fetchNotionContext, formatNotionContextForPrompt } from "@/lib/integrations/notion";
import { fetchLinearContext, formatLinearContextForPrompt } from "@/lib/integrations/linear";
import { sanitizeModelOutput } from "@/lib/ai-providers";
import { buildArchetypeSystemContext } from "@/lib/founderArchetype";
import { buildDebtPromptInjection, computeExecutionDebt, debtSuppressesTask, markDebtSurfaced } from "@/lib/executionDebt";
import { recordActivity } from "@/lib/server/activityLog";
import { buildPersonalizedTodayDraft } from "@/lib/todayDrafts";
import { buildKnowledgeBaseContext, searchFounderKnowledgeBase, type FounderKnowledgeMatch } from "@/lib/founderKnowledgeBase";
import { loadCognitionInput, synthesizeFounderCognition, buildCognitionPromptBlock } from "@/lib/founderCognition";
import { evaluateAIOutput } from "@/lib/aiEvaluator";
import { getPromptForRequest, loadActivePrompts } from "@/lib/promptRegistry";
import { upsertTodayActionCache } from "@/lib/todayActionCache";
import { buildTodayPersonalisationContext } from "@/lib/todayPersonalisationContext";
import { loadBehavioralContext } from "@/lib/behavioralLayers";
import { summarizeFounderIntelligenceForClient, type FounderIntelligenceState } from "@/lib/founderIntelligence";
import { loadTodayActionContext } from "@/lib/todayActionContext";


export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30; // reflexion loop (Generator + Critic + Refiner) ~15–20 s
import { inferStage } from "@/lib/stages";
import { recordActionShown } from "@/lib/learning";
import { truncateWords } from "@/lib/textTruncate";

type TodayAction = {
  action: string;        // Concrete task with platform, user type, count, and context
  platform: string;      // Exact platform: "WhatsApp", "LinkedIn", "Email", "In person", etc.
  target_user: string;   // Specific person type from their target_users field
  message: string;       // Ready-to-send script or message they can copy-paste
  why: string;           // 1-2 sentences referencing their actual stage + situation
  time: string;          // Realistic time estimate
  difficulty?: "light" | "focused" | "deep"; // From lib/reflexion.ts's estimateTaskDifficulty()
};

type ReflexionStatus = "ok" | "partial" | "failed";

function cleanVisibleText(value: string | undefined, fallback: string): string {
  const clean = sanitizeModelOutput(value ?? "");
  return clean || fallback;
}

function inferAudience(action: string, explicit: string): string {
  if (explicit.trim()) return explicit.trim();
  const match = action.match(/\b(?:to|with)\s+(?:\d+\s+)?(.+?)(?:\s+(?:on|via|today|who|and|while|before|after)|\s+[—-]|[.,]|$)/i);
  return match?.[1]?.trim() || "people in your target segment";
}

function inferTopic(action: string, explicit: string, title: string): string {
  if (explicit.trim()) return explicit.trim();
  const about = action.match(/\b(?:about|around|with)\s+(.+?)(?:[.,]|[—-]|\s+today|\s+before|\s+after|$)/i);
  if (about?.[1]?.trim()) return about[1].trim();
  return title.trim() ? `${title.trim()} and the problem it solves` : "this workflow";
}

function buildPersonalizedDraft(action: string, fallback: TodayAction, context: { title: string; targetUsers: string; problem: string }): string {
  const audience = inferAudience(action, context.targetUsers);
  const topic = inferTopic(action, context.problem, context.title);
  const product = context.title.trim();
  if (product) {
    return `Hi [Name], quick question - I'm researching ${topic} for ${audience}. How are you handling this today, and what is the most frustrating part? I'd value 10 minutes of honest context.`;
  }
  return cleanVisibleText(fallback.message, `Hi [Name], quick question - how are you handling ${topic} today, and what is the most frustrating part? I'd value 10 minutes of honest context.`);
}

/** Build a project-specific fallback using real project data — never placeholder text */
function inferProjectAudience(targetUsers: string, title: string, description = "", problem = ""): string {
  if (targetUsers?.trim()) return targetUsers.trim();
  const haystack = `${title} ${description} ${problem}`.toLowerCase();
  if (/(consent|privacy|gdpr|compliance|audit)/.test(haystack)) return "data privacy officers or compliance managers";
  if (/(fintech|payment|bank|invoice|accounting|finance)/.test(haystack)) return "finance operators or fintech founders";
  if (/(health|clinic|patient|medical)/.test(haystack)) return "healthcare operators";
  if (/(school|student|teacher|course|learning)/.test(haystack)) return "education operators";
  if (/(shop|commerce|store|retail)/.test(haystack)) return "e-commerce operators";
  return title?.trim() ? `${title.trim()} target users` : "people in your target segment";
}

function inferProjectProblem(problem: string, title: string, description = ""): string {
  if (problem?.trim()) return problem.trim();
  const haystack = `${title} ${description}`.toLowerCase();
  if (/(consent|privacy|gdpr|compliance|audit)/.test(haystack)) return "verifiable consent tracking and audit logging";
  if (description?.trim()) return description.trim().slice(0, 120);
  return title?.trim() ? `${title.trim()} and the workflow it improves` : "their current workflow";
}

function buildContextualFallback(stage: string, targetUsers: string, problem: string, title: string, description = ""): TodayAction {
  const userType = inferProjectAudience(targetUsers, title, description, problem);
  const problemDesc = inferProjectProblem(problem, title, description);
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
    void loadActivePrompts();
    // Authenticate session first — userId in body must match the session user
    const routeUser = await getRouteUser();
    if (!routeUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => ({}));

    // Zod validation — typed, early rejection of malformed inputs
    const { z } = await import("zod");
    const bodySchema = z.object({
      userId:            z.string().optional(),
      projectId:         z.string().optional(),
      stage:             z.string().max(50).optional(),
      pendingMilestones: z.array(z.string().max(100)).max(5).optional(),
      pendingTasks:      z.array(z.string().max(100)).max(5).optional(),
      completionRate:    z.number().min(0).max(100).optional(),
      acknowledgeDebt:   z.boolean().optional(),
    });
    const parsedBody = bodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json({ success: false, error: "Invalid request body", issues: parsedBody.error.flatten() }, { status: 400 });
    }
    const body = parsedBody.data;

    const userId = String(body?.userId ?? routeUser.userId).trim();
    const requestId = generateRequestId(); // traces this pipeline run through all log lines
    const projectId = String(body?.projectId ?? "").trim();
    const providedStage = String(body?.stage ?? "").trim().slice(0, 50);
    const clientPendingMilestones: string[] = body?.pendingMilestones ?? [];
    const clientPendingTasks: string[]       = body?.pendingTasks ?? [];
    const clientCompletionRate = body?.completionRate ?? null;
    const acknowledgeDebt = body?.acknowledgeDebt ?? false;

    // Prevent one user from fetching another user's project data
    if (userId !== routeUser.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!userId || !projectId) {
      return NextResponse.json({ success: false, error: "userId and projectId required" }, { status: 400 });
    }

    // feature: "core" — this is the single daily action, the habit loop the
    // whole product is built around. It gets its own generous allowance so
    // usage on AI Coach / Break My Startup / reflections never blocks it.
    await enforceAndTrackAIUsage(userId, routeUser.plan, "core");

    let projectContext = "";
    let stage = providedStage || "Idea";
    let targetUsers = "";
    let problem = "";
    let title = "";
    let lastReflectionContext = "";
    let founderArchetype: string | undefined;
    let knowledgeMatches: FounderKnowledgeMatch[] = [];
    let supabase: ReturnType<typeof createAdminClient> | null = null;
    let hoistedReflection: {
      outcome?: string | null;
      note?: string | null;
      confidence?: number | null;
      today_action?: string | null;
      created_at?: string | null;
      what_tried?: string | null;
      what_happened?: string | null;
      what_learned?: string | null;
      blocker?: string | null;
    } | null = null;
    let recentActionHistory = "";
    let cognitionBlock = "";
    let cognitionMomentumScore = 50;
    let cognitionAvoidanceSignals: string[] = [];
    let cognitionCognitiveLoad: ReflexionContext["cognitiveLoad"] = "fresh";
    let founderIntelligence: FounderIntelligenceState | null = null;
    let founderIntelligencePromptBlock = "";
    let personalisationCtx = { recentActionsBlock: "", recentReflectionsBlock: "", recurringBlockers: [] as string[], activeGoals: [] as string[] };

    // ── Shared context loader (lib/todayActionContext.ts) ──────────────────
    // All DB reads, debt computation, cognition, knowledge-base, personalisation
    // and Founder Intelligence OS loading now live in one place, shared with
    // today-action/stream/route.ts (the primary SSE path).
    const tctx = await loadTodayActionContext({
      userId,
      projectId,
      providedStage,
      acknowledgeDebt,
      sessionId: requestId,
    });

    if (tctx.debtSuppression.suppressed) {
      return NextResponse.json({
        success: true,
        data: {
          debtSuppressed: true,
          debtCategory: tctx.debtSuppression.category,
          debtMessage: tctx.debtSuppression.message,
          interventionHint: tctx.debtSuppression.interventionHint,
          stage: tctx.stage,
        },
      });
    }

    stage = tctx.stage;
    targetUsers = tctx.targetUsers;
    problem = tctx.problem;
    title = tctx.title;
    projectContext = tctx.projectContext;
    lastReflectionContext = tctx.lastReflectionContext;
    founderArchetype = tctx.founderArchetype;
    knowledgeMatches = tctx.knowledgeMatches;
    cognitionBlock = tctx.cognitionBlock;
    cognitionMomentumScore = tctx.cognitionMomentumScore;
    cognitionAvoidanceSignals = tctx.cognitionAvoidanceSignals;
    supabase = tctx.adminClient;
    founderIntelligence = tctx.founderIntelligence;
    founderIntelligencePromptBlock = tctx.founderIntelligencePromptBlock;
    personalisationCtx = tctx.personalisationCtx;
    // Non-stream route still uses hoistedReflection for the Reflexion context
    // below; populate it from lastReflectionNote if available.
    recentActionHistory = "";
    // energy check-in (components using handleCogLoad) with values
    // "low" | "normal" | "high" — but this field was being passed straight
    // through as if it already matched ReflexionContext's expected
    // "fresh" | "drained" | "autopilot" vocabulary. It never did (confirmed:
    // no other writer of this column exists anywhere in the codebase — only
    // the Today page writes it, and only ever with low/normal/high). Two
    // real consequences this caused: (1) the prompt text at lib/reflexion.ts
    // ~660/830 was literally interpolating "low"/"normal"/"high" into
    // "Cognitive state today: X" instead of the intended vocabulary, and
    // (2) lib/reflexion.ts:343's `ctx.cognitiveLoad !== "fresh"` complexity-
    // scoring check fired unconditionally for every real value a founder
    // could pick, since none of low/normal/high ever equals the literal
    // string "fresh" — so every energy selection scored identically.
    function mapEnergyToCognitiveLoad(raw: unknown): ReflexionContext["cognitiveLoad"] {
      if (raw === "low") return "drained";
      // "normal" and "high" both map to "fresh" for now — there's no
      // "high energy, assign something harder" concept in reflexion.ts's
      // current vocabulary. Worth a real product decision later (should
      // high energy actively bias toward more ambitious tasks?), not
      // assumed here.
      if (raw === "normal" || raw === "high") return "fresh";
      return "fresh";
    }
    let founderCountry: string | undefined;
    // FIX 1.3: Hoist memoryResult to outer scope so it can be reused later
    // without a second DB round-trip to founder_memory
    let memoryResult: PromiseSettledResult<{ data: Record<string, unknown> | null; error: unknown }> | null = null;
    let contextResult: PromiseSettledResult<{ data: Record<string, unknown> | null; error: unknown }> | null = null;

    if (hasAdminEnv()) {
      supabase = createAdminClient();

      // Fetch project, founder_memory, and last reflection in one parallel round-trip
      // (eliminates the second reflections fetch that was happening 80 lines below)
      const [projectResult, _memoryResult, reflectionResult, _contextResult] = await Promise.allSettled([
        supabase
          .from("projects")
          .select("name, title, description, target_users, problem, startup_stage, biggest_blocker, created_at, current_mrr")
          .eq("id", projectId)
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("founder_memory")
          .select("avoidance_zones, strengths, personality_tags, last_insight, cofounder_style, decision_patterns, last_debt_surfaced, archetype_confidence")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("reflections")
          .select("outcome, note, confidence, today_action, created_at, what_tried, what_happened, what_learned, blocker")
          .eq("user_id", userId)
          // Only reflections from the last 48 hours — prevents stale reflection
          // from repeating the same task type day after day.
          .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("founder_context")
          .select("avoidance_zones, override_reasons, tasks_overridden_this_week, topics_mentioned_repeatedly, days_inactive, consecutive_tasks_completed, cognitive_load, momentum_score, streak, pattern_flags, country")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      memoryResult = _memoryResult;
      contextResult = _contextResult;
      const project = projectResult.status === "fulfilled" ? projectResult.value.data : null;
      const memory = memoryResult.status === "fulfilled" ? memoryResult.value.data : null;
      hoistedReflection = reflectionResult.status === "fulfilled" ? reflectionResult.value.data : null;

      const { data: milestones } = await supabase
        .from("milestones")
        .select("id, title, status")
        .eq("project_id", projectId)
        // order_index is the roadmap-generation-assigned sequence (see
        // generate-roadmap/route.ts); created_at is only a tiebreak for
        // rows sharing the same order_index.
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });

      const milestoneIds = (milestones ?? []).map((m) => m.id);
      
      // Batch milestone IDs to avoid URL length limits
      let allTasks: Array<{ title: string; is_completed: boolean; milestone_id: string; priority: number | null }> = [];
      if (milestoneIds.length > 0) {
        const BATCH_SIZE = 20;
        const batches = [];
        for (let i = 0; i < milestoneIds.length; i += BATCH_SIZE) {
          const batchIds = milestoneIds.slice(i, i + BATCH_SIZE);
          const tasksQuery = supabase.from("tasks").select("title, is_completed, milestone_id, priority");
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
        // FIX: each batch was returned in whatever order Postgres felt like
        // (no ORDER BY), and batches were then concatenated as-is, so
        // pendingTasksList's .slice(0, 5) below was picking an arbitrary
        // 5 tasks rather than the highest-priority ones. roadmap generation
        // sets priority = stageDistance * 10 + taskIdx + 1 (lower = more
        // urgent, see generate-roadmap/route.ts), so sort ascending here.
        allTasks.sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5));
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
        // Surface the onboarding blocker in the first 3 days so the first actions
        // directly address what the founder said was their biggest challenge.
        const projectCreatedAt = project.created_at ? new Date(project.created_at) : null;
        const daysSinceOnboarding = projectCreatedAt
          ? Math.floor((Date.now() - projectCreatedAt.getTime()) / 86400000)
          : 999;
        const onboardingBlockerLine = project.biggest_blocker && daysSinceOnboarding <= 3
          ? `
FOUNDER'S STATED BLOCKER AT ONBOARDING: "${project.biggest_blocker}"
→ This is what they said their biggest challenge was. Today's task must directly address or reduce this blocker. Reference it explicitly in the rationale.`
          : "";

        // Notion / Linear context injection (Audit v8 PROD #8)
        // Pull the founder's real task list and inject it into the Generator prompt.
        // This prevents the AI from suggesting work the founder is already doing.
        let integrationContext = "";
        if (hasAdminEnv()) {
          try {
            const { data: integrations } = await supabase
              .from("integrations")
              .select("provider, access_token, database_id")
              .eq("user_id", userId)
              .in("provider", ["notion", "linear"]);

            for (const intg of (integrations ?? []) as Array<{ provider: string; access_token: string; database_id?: string }>) {
              if (intg.provider === "notion" && intg.database_id) {
                const notionCtx = await fetchNotionContext(intg.access_token, intg.database_id);
                integrationContext += formatNotionContextForPrompt(notionCtx);
              } else if (intg.provider === "linear") {
                const linearCtx = await fetchLinearContext(intg.access_token);
                integrationContext += formatLinearContextForPrompt(linearCtx);
              }
            }
          } catch { /* non-fatal — integration context is best-effort */ }
        }

        projectContext = `
Project: ${project.name ?? project.title}
Stage: ${stage}
Problem: ${project.problem ?? "Not specified"}
Target users: ${project.target_users ?? "Not specified"}
Description: ${project.description ?? "Not specified"}
Overall progress: ${completedTasks}/${totalTasks} tasks done (${completionPct}%), ${completedMilestones}/${(milestones ?? []).length} milestones complete
Pending milestones (next to tackle): ${pendingMilestonesList.length ? pendingMilestonesList.join(", ") : "None"}
Next open tasks: ${pendingTasksList.length ? pendingTasksList.join(", ") : "None"}
Current MRR: ${project.current_mrr && project.current_mrr > 0 ? `GHS ${(project.current_mrr / 100).toFixed(0)} / month` : "GHS 0 (pre-revenue)"}${project.current_mrr && project.current_mrr > 0 ? "\n→ This founder has paying customers. Tasks must prioritize retention, upsell, and reducing churn over acquisition." : "\n→ This founder has no revenue yet. Every task should move them closer to a first paying customer."}${onboardingBlockerLine}${integrationContext}`;
      }

      // ── Founder memory context — informs task assignment ─────────────────
      // Avoidance zones: if the natural next task falls in an avoidance zone,
      // the prompt must name it and push through it, not route around it.
      if (memory) {
        const avoidance = (memory.avoidance_zones ?? []) as string[];
        const strengths = (memory.strengths ?? []) as string[];
        const lastInsight = memory.last_insight as string | null;
        const lastWeekSummaryRaw = (memory as Record<string, unknown>).last_week_summary as string | null;
        founderArchetype = ((memory.personality_tags ?? []) as string[])
          .find((tag) => tag.startsWith("archetype:"))
          ?.replace("archetype:", "");

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
          const archetypeContext = buildArchetypeSystemContext((memory.personality_tags ?? []) as string[]);
          if (archetypeContext) lastReflectionContext += `\n\n${archetypeContext}`;
        }

        // REC 2.1: On Mondays, inject last week's summary as causal context for today's task
        const isMonday = new Date().getDay() === 1;
        if (isMonday && lastWeekSummaryRaw) {
          try {
            const lastWeek = JSON.parse(lastWeekSummaryRaw) as {
              tasks_completed?: number; avg_confidence?: number;
              biggest_gap?: string; next_week_focus?: string;
              intention_vs_execution_rate?: number; execution_trend?: string;
              avoidance_summary?: string; override_count?: number;
            };
            lastReflectionContext += `\n\nLAST WEEK SUMMARY (Monday — use this to set today's direction):`;
            lastReflectionContext += `\nCompleted ${lastWeek.tasks_completed ?? 0} tasks. Avg confidence: ${lastWeek.avg_confidence ?? "?"}/5`;
            if (lastWeek.intention_vs_execution_rate != null) {
              lastReflectionContext += `\nIntention vs execution rate: ${lastWeek.intention_vs_execution_rate}% (${lastWeek.execution_trend ?? "flat"} trend)`;
            }
            if (lastWeek.override_count != null && lastWeek.override_count > 0) {
              lastReflectionContext += `\nOverrode/blocked ${lastWeek.override_count} tasks last week.`;
            }
            if (lastWeek.avoidance_summary) {
              lastReflectionContext += `\nAvoidance patterns detected: "${lastWeek.avoidance_summary}"`;
            }
            if (lastWeek.biggest_gap) lastReflectionContext += `\nBiggest gap last week: "${lastWeek.biggest_gap}"`;
            if (lastWeek.next_week_focus) lastReflectionContext += `\nFocused direction for this week: "${lastWeek.next_week_focus}"`;
            lastReflectionContext += `\nINSTRUCTION: Monday's first task must directly address the biggest gap from last week. If override rate was high last week (avg confidence <3 or intention_vs_execution_rate <50%), start with an easier confidence-building task that routes around the detected avoidance patterns.`;
          } catch { /* non-fatal — malformed JSON in last_week_summary */ }
        }
      }

      // Use the hoisted reflection fetched in the parallel round-trip above
      const lastReflection = hoistedReflection;

      if (lastReflection) {
        const reflectDate = lastReflection.created_at
          ? new Date(lastReflection.created_at).toLocaleDateString()
          : "recently";
        lastReflectionContext = `
LAST REFLECTION (${reflectDate}):
Yesterday's action: "${lastReflection.today_action ?? "Not recorded"}"
Outcome: ${lastReflection.outcome}
Confidence (1-5): ${lastReflection.confidence}
Their note: "${lastReflection.note ?? "No note"}"
${lastReflection.what_tried ? `What they actually tried: "${lastReflection.what_tried}"` : ""}
${lastReflection.what_happened ? `What concretely happened: "${lastReflection.what_happened}"` : ""}
${lastReflection.what_learned ? `What they learned: "${lastReflection.what_learned}"` : ""}
${lastReflection.blocker ? `Specific blocker: "${lastReflection.blocker}"` : ""}

INSTRUCTION: Use what_tried and what_happened as the primary signal for today's task direction.
- If what_tried is populated, today's task must be a direct causal response to it
- blocked outcome + blocker -> today's task must remove that specific blocker
- completed outcome -> go one level deeper on the same thread, but do not repeat the same action or message
- confidence 1-2 -> give an easier, confidence-building first step
- what_learned -> apply the insight to one concrete action today
- if the prior action was completed, preserve the stage and target area while refining the next task from their reflection note` + lastReflectionContext;
      }

      try {
        const { data: recentRows } = await supabase
          .from("reflections")
          .select("outcome, note, today_action, created_at")
          .eq("user_id", userId)
          .not("today_action", "is", null)
          .order("created_at", { ascending: false })
          .limit(8);

        const lines = (recentRows ?? [])
          .filter((r) => r.today_action)
          .map((r, i) => {
            const note = r.note ? ` | note: ${String(r.note).slice(0, 120)}` : "";
            return `${i + 1}. "${r.today_action}" -> ${r.outcome ?? "unknown"}${note}`;
          });

        // FIX: Also inject the current cached task as a "replaced" history entry.
        // When the user replaces a task without completing it, no reflection is written,
        // so the AI has no memory of having shown that task before. This creates the
        // stale-task loop (same task repeating for 2+ weeks). By explicitly telling the
        // AI about replaced tasks, the anti-repetition guard fires correctly.
        try {
          const { data: cacheRow } = await supabase
            .from("user_behavior_state")
            .select("value")
            .eq("user_id", userId)
            .eq("key", "today_action_cache")
            .maybeSingle();
          const cachedTask = (cacheRow?.value as { data?: { action?: string }; shown_count?: number } | null);
          if (cachedTask?.data?.action) {
            const shownCount = cachedTask.shown_count ?? 1;
            lines.push(`[REPLACED/SKIPPED ${shownCount}x without completion]: "${cachedTask.data.action}" -> replaced`);
          }
        } catch { /* non-fatal */ }

        if (lines.length) {
          recentActionHistory = `\n\nRECENT ACTION HISTORY (do not repeat these task shapes or messages):\n${lines.join("\n")}`;
          lastReflectionContext += `${recentActionHistory}\nINSTRUCTION: Today's action must be a genuinely new next move. It may continue the same strategic thread, but it must change the person, channel, ask, experiment, or success criterion. Never reuse the previous outreach copy.`;
        }
      } catch { /* non-fatal — generation can continue without history */ }
    }

    if (hasAdminEnv() && (title || projectContext)) {
      const cognitionInput = await loadCognitionInput(userId, stage, title);
      const cognitionState = await synthesizeFounderCognition(userId, cognitionInput);
      cognitionBlock = buildCognitionPromptBlock(cognitionState);
      cognitionMomentumScore = cognitionState.signal_confidence > 0.3
        ? (cognitionInput.context?.momentum_score ?? 50)
        : 50;
      cognitionAvoidanceSignals = cognitionInput.memory?.avoidance_zones ?? [];
      cognitionCognitiveLoad = mapEnergyToCognitiveLoad(cognitionInput.context?.cognitive_load);
    }

    if (hasAdminEnv() && (title || problem || targetUsers)) {
      knowledgeMatches = await searchFounderKnowledgeBase(
        `${title}. ${problem}. ${targetUsers}. ${projectContext}`.trim(),
        stage,
        founderArchetype,
        0,
      );
      const knowledgeContext = buildKnowledgeBaseContext(knowledgeMatches, founderArchetype);
      if (knowledgeContext) lastReflectionContext += `\n\n${knowledgeContext}`;
    }

    if (hasAdminEnv() && projectId) {
      personalisationCtx = await buildTodayPersonalisationContext(userId, projectId);
    }

    if (personalisationCtx.recentActionsBlock) {
      lastReflectionContext += `\n\n${personalisationCtx.recentActionsBlock}`;
    }
    if (personalisationCtx.recentReflectionsBlock) {
      lastReflectionContext += `\n\n${personalisationCtx.recentReflectionsBlock}`;
    }
    if (personalisationCtx.recurringBlockers.length > 0) {
      lastReflectionContext += `\n\nRECURRING BLOCKERS:\n${personalisationCtx.recurringBlockers.map((b) => `- "${b}"`).join("\n")}\n-> Today's task must address or route around at least one of these.`;
    }
    if (personalisationCtx.activeGoals.length > 0) {
      lastReflectionContext += `\n\nACTIVE GOALS (advance one today):\n${personalisationCtx.activeGoals.map((g, i) => `${i + 1}. ${g}`).join("\n")}`;
    }

    // NOTE: founderIntelligence loading + prediction recording already
    // happened inside loadTodayActionContext() above (tctx.founderIntelligence,
    // tctx.founderIntelligencePromptBlock) — this used to reload it a second
    // time here AND call recordFounderIntelligencePrediction() again,
    // writing a duplicate prediction row into the learning-loop accuracy
    // table on every single request. Removed; tctx's values are used as-is.

    // Build contextual fallback using real project data (never placeholder text)
    const fallback = buildContextualFallback(stage, targetUsers, problem, title, projectContext);

    let debtContext = "";
    if (hasAdminEnv() && memoryResult?.status === "fulfilled" && contextResult?.status === "fulfilled") {
      const memory = (memoryResult.value.data ?? {}) as {
        avoidance_zones?: string[];
        decision_patterns?: unknown[];
        personality_tags?: string[];
        last_debt_surfaced?: Record<string, string> | null;
      };
      const context = (contextResult.value.data ?? {}) as {
        avoidance_zones?: string[];
        override_reasons?: string[];
        tasks_overridden_this_week?: number;
        topics_mentioned_repeatedly?: string[];
        days_inactive?: number;
        country?: string;
      };
      founderCountry = context.country ?? undefined;
      const debt = computeExecutionDebt({
        avoidance_zones: context.avoidance_zones ?? [],
        override_reasons: context.override_reasons ?? [],
        tasks_overridden_this_week: context.tasks_overridden_this_week ?? 0,
        topics_mentioned_repeatedly: context.topics_mentioned_repeatedly ?? [],
        days_inactive: context.days_inactive ?? 0,
      }, {
        avoidance_zones: memory.avoidance_zones ?? [],
        decision_patterns: [],
        personality_tags: memory.personality_tags ?? [],
        last_debt_surfaced: memory.last_debt_surfaced ?? null,
      });
      debtContext = buildDebtPromptInjection(debt);
      if (debtSuppressesTask(debt) && !body.acknowledgeDebt) {
        await markDebtSurfaced(userId, debt);
        return NextResponse.json({
          success: true,
          data: {
            debtSuppressed: true,
            debtCategory: debt.category,
            debtMessage: debt.message,
            interventionHint: debt.interventionHint,
            stage,
          },
        });
      }
      if (body.acknowledgeDebt) {
        recordActivity(userId, "task_overridden", { projectId, debtCategory: debt.category }).catch(() => {});
      }
    }

    // Fix #3: Removed pre-call groqJSON — was wasting 1-2 extra Groq calls per load.
    // Context is fed directly into Agent A as the seed. Reflexion loop (Gen→Crit→Refine)
    // runs once. This cuts 4-6 calls/load down to 2-3, more than doubling free-tier endurance.
    const criticPersona = getWeeklyCriticPersona();
    const reflexionContext: import("@/lib/reflexion").ReflexionContext = {
      startupSummary: projectContext || `${title} — ${problem || "early stage startup"}`,
      stage,
      problem: problem || undefined,
      targetUsers: targetUsers || undefined,
      momentumScore: cognitionMomentumScore,
      avoidanceSignals: cognitionAvoidanceSignals,
      cognitiveLoad: cognitionCognitiveLoad,
      archetypeContext: cognitionBlock,
      debtContext,
      reflectionHistory: recentActionHistory || undefined,
      recentActionsBlock: personalisationCtx.recentActionsBlock || undefined,
      country: founderCountry,
      cofounderJudgment: founderIntelligence ? buildCofounderJudgment(founderIntelligence) : undefined,
      // ── Goal Anchor — prevents task drift when reflections are negative ────────
      // A bad reflection ("I didn't do it", "it failed") becomes the dominant signal
      // if no north-star goal is present, causing the AI to abandon the startup's
      // core objective. goalAnchor pins every task to what actually matters.
      goalAnchor: (() => {
        const stageNorthStar: Record<string, string> = {
          Idea:       "Validate the core problem with real people — talk to 5 potential users before building anything.",
          Validation: "Get 3 genuine commitment signals (time, money, or workflow change) from people outside your network.",
          MVP:        "Ship a working version to at least 2 real users and watch them use it without guidance.",
          Launch:     "Drive 10+ qualified visitors or sign-ups through one repeatable channel.",
          Growth:     "Retain at least 60% of users week-over-week while adding new ones.",
          Revenue:    "Close or upsell one paying customer and document exactly what made them say yes.",
        };
        const northStar = stageNorthStar[stage] ?? stageNorthStar.Idea;
        const parts: string[] = [];
        if (problem) parts.push(`Core problem: ${problem}`);
        if (targetUsers) parts.push(`For: ${targetUsers}`);
        parts.push(`Stage objective: ${northStar}`);
        return parts.join("\n");
      })(),
    };

    // Populate reflexionContext from data already fetched in the parallel round-trip above.
    // No additional DB calls needed — both memoryResult and hoistedReflection are already in scope.
    if (hasAdminEnv() && supabase) {
      // Avoidance signals + cofounder style — from already-fetched memoryResult
      if (memoryResult && memoryResult.status === "fulfilled" && memoryResult.value.data) {
        const m = memoryResult.value.data;
        if (!cognitionAvoidanceSignals.length) {
          reflexionContext.avoidanceSignals = (m.avoidance_zones ?? []) as string[];
        }
        // Wire cofounder_style so Stage 7 Refiner adjusts its communication tone
        if (m.cofounder_style) {
          reflexionContext.cofounderStyle = m.cofounder_style as ReflexionContext["cofounderStyle"];
        }
      }
      // Session count for new-user cold-start injection — prevents the pipeline
      // from referencing behavioral patterns that don't exist yet for new founders.
      // Reflections count is a cheap proxy: one count() call on an indexed column.
      try {
        const { count } = await supabase
          .from("reflections")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);
        reflexionContext.sessionCount = count ?? 0;
      } catch { /* non-fatal — defaults to 999 (skips new-user injection) */ }
      // Reuse the hoisted reflection — no extra DB call needed
      if (hoistedReflection) {
        reflexionContext.lastReflection = {
          outcome: hoistedReflection.outcome ?? "unknown",
          note: hoistedReflection.note ?? "",
          confidence: hoistedReflection.confidence ?? 3,
        };
      }
      // Wire founder_context behavioral signals — fetched above but previously discarded
      if (contextResult?.status === "fulfilled" && contextResult.value.data) {
        const ctx = contextResult.value.data as {
          override_reasons?: string[];
          topics_mentioned_repeatedly?: string[];
          days_inactive?: number;
          consecutive_tasks_completed?: number;
        };
        if (!reflexionContext.overrideReasons?.length) {
          reflexionContext.overrideReasons = ctx.override_reasons ?? [];
        }
        if (!reflexionContext.topicsRepeated?.length) {
          reflexionContext.topicsRepeated = ctx.topics_mentioned_repeatedly ?? [];
        }
        if (reflexionContext.daysInactive === undefined || reflexionContext.daysInactive === 0) {
          reflexionContext.daysInactive = ctx.days_inactive ?? 0;
        }
        if (!reflexionContext.consecutiveTasksCompleted) {
          reflexionContext.consecutiveTasksCompleted = ctx.consecutive_tasks_completed ?? 0;
        }
      }
    }

    // ── Seven-Layer Behavioral Context ──────────────────────────────────────
    // Load all 7 behavioral layers in parallel — non-fatal, best-effort.
    let behavioralPromptBlock = "";
    if (hasAdminEnv() && supabase && userId) {
      try {
        const behavioralCtx = await loadBehavioralContext(
          supabase,
          userId,
          cognitionMomentumScore,
          null,
          null,
        );
        behavioralPromptBlock = behavioralCtx.promptBlock;
      } catch { /* non-fatal — behavioral layers are enhancement only */ }
    }

    // Build seed from founder context directly — no pre-call needed
    const taskSeed = [
      `Stage: ${stage}`,
      `Problem: ${problem || "Not specified"}`,
      `Target users: ${targetUsers || "Not specified"}`,
      lastReflectionContext ? `Last reflection: ${lastReflectionContext}` : "",
      recentActionHistory ? `Anti-repetition guard: ${recentActionHistory}` : "",
      behavioralPromptBlock || "",
      founderIntelligencePromptBlock || "",
    ].filter(Boolean).join("\n");

    let reflexionOutput: Awaited<ReturnType<typeof runReflexionLoop>> | null = null;
    let reflexionStatus: ReflexionStatus = "partial";
    try {
      reflexionOutput = await runReflexionLoop(taskSeed, reflexionContext);
      reflexionStatus = reflexionOutput ? "ok" : "partial";
    } catch (err) {
      reflexionStatus = "failed";
      logError("today-action/reflexion", err, { route: "/api/ai/today-action", userId, requestId });
      // Reflexion loop failure is non-fatal — use single-pass result

      // FIX: this is the exact failure mode that ran silently for 6 weeks
      // for one user — every single day fell back to the same static
      // per-stage template, invisible anywhere except console/Sentry logs
      // (which don't retain 6 weeks of history). Now persisted so it's
      // queryable and the health-check page can flag repeat offenders.
      if (supabase) {
        supabase
          .from("ai_generation_fallback_events")
          .insert({
            user_id: userId,
            route: "today-action",
            stage,
            error_message: err instanceof Error ? err.message : String(err),
          })
          .then(() => {}, () => {}); // best-effort — never blocks the response
      }
    }

    // ── Merge reflexion output back into TodayAction shape ─────────────────
    // Extract a short imperative title from the reflexion output.
    // The refiner returns 3–5 sentences. The card title should be the first
    // sentence only — capped at 12 words — so it reads as a clear directive,
    // not a paragraph dumped into a headline slot.
    function extractActionTitle(output: string, fallbackAction: string): string {
      if (!output?.trim()) return fallbackAction;
      // FIX: previously capped at 12 words with NO ellipsis at all — the
      // confirmed cause of tasks reading as cut off mid-sentence on Today.
      // A task described as needing "platform, user type, count, and
      // context" (see TodayAction's own field comments above) is inherently
      // a longer sentence than 12 words allows. Raised the cap and switched
      // to the shared, ellipsis-aware truncateWords() so a genuinely long
      // title is visibly shortened, not silently severed.
      const firstSentence = output.trim().match(/^([^.\n\u2014]+[.\u2014]?\s*)/)?.[1]?.trim() ?? output.trim();
      const title = truncateWords(firstSentence, 18);
      return title || fallbackAction;
    }

    const finalResult: TodayAction & {
      reflexion?: {
        verdict: string;
        criticPersona: string;
        rationale: string;
        loopRan: boolean;
        passedCritic: boolean;
        lastReflectionUsed: boolean;
      };
      body?: string; // full reflexion output, stored separately from the card title
      decisionBasis?: {
        expected_evidence: string;
        why_it_beats_alternatives: string;
        score: number;
        alternatives: Array<{ action: string; score: number; why: string }>;
      };
    } = {
      ...fallback,
      // Card title: short imperative extracted from reflexion output
      action: founderIntelligence?.decision.top_candidate?.action ?? extractActionTitle(reflexionOutput?.output ?? "", fallback.action),
      // Full body stored separately so the UI can show detail if needed
      ...(reflexionOutput?.output ? { body: cleanVisibleText(reflexionOutput.output, "") } : {}),
      // If reflexion ran, its rationale becomes the task's why
      why: founderIntelligence?.decision.top_candidate
        ? `${cleanVisibleText(reflexionOutput?.rationale, fallback.why)} ${founderIntelligence.decision.top_candidate.why_it_beats_alternatives}`
        : cleanVisibleText(reflexionOutput?.rationale, fallback.why),
      // FIX: difficulty was never surfaced anywhere — the only prior
      // per-something difficulty concept (isHardTask in
      // task-complete/route.ts) is scoped to project stage, not this task.
      difficulty: reflexionOutput?.difficulty,
    };
    if (founderIntelligence?.decision.top_candidate) {
      finalResult.decisionBasis = {
        expected_evidence: founderIntelligence.decision.top_candidate.expected_evidence,
        why_it_beats_alternatives: founderIntelligence.decision.top_candidate.why_it_beats_alternatives,
        score: founderIntelligence.decision.top_candidate.scores.total,
        alternatives: founderIntelligence.decision.candidates.slice(1, 4).map((c) => ({
          action: c.action,
          score: c.scores.total,
          why: c.why_it_beats_alternatives,
        })),
      };
    }
    finalResult.message = buildPersonalizedTodayDraft(finalResult.action, fallback, {
      title,
      targetUsers,
      problem,
      stage,
      archetypeStyle: founderArchetype,
      knowledgeMatches,
    });

    if (reflexionOutput) {
      finalResult.reflexion = {
        verdict: reflexionOutput.verdict ?? "pass",
        criticPersona: criticPersona.name,
        rationale: cleanVisibleText(reflexionOutput.rationale, fallback.why),
        loopRan: true,
        passedCritic: reflexionOutput.verdict !== "fail",
        lastReflectionUsed: Boolean(reflexionContext.lastReflection),
      };
    }

    // ── Gatekeeper quality log ──────────────────────────────────────────────
    if (hasAdminEnv() && finalResult.action) {
      const { version: promptVersion, variant } = getPromptForRequest("reflexion_generator", userId);
      void evaluateAIOutput({
        userId,
        projectId,
        context: "today_action",
        promptId: "reflexion_generator",
        promptVersion,
        variant,
        output: finalResult.action,
        originalOutput: reflexionOutput?.critique ?? undefined,
        founderContext: {
          stage,
          targetUsers,
          archetype: founderArchetype,
          lastReflection: hoistedReflection?.note ?? undefined,
          avoidanceZones: reflexionContext.avoidanceSignals,
          momentumScore: reflexionContext.momentumScore,
        },
      });
    }

    // ── Learning loop — record action shown (Playbook §5, Month 2) ───────────
    // Extends reflexion_learning_log to the daily loop so the learning system
    // has data from every check-in, not just break-my-startup sessions.
    // Fire-and-forget — never blocks the response.
    if (hasAdminEnv() && finalResult.action && userId) {
      recordActivity(userId, "task_accepted", { projectId, stage, action: finalResult.action }).catch(() => {});
      const learningSessionId = `today_action:${projectId ?? "none"}:${Date.now()}`;
      const logRowId = await recordActionShown({
        userId,
        projectId: projectId ?? "",
        sessionId: learningSessionId,
        stage,
        actionShown: finalResult.action,
        criticPersona: reflexionOutput ? getWeeklyCriticPersona().name : "fallback",
        viabilityScore: undefined,
        confidence: undefined,
      }).catch((err) => logError("today-action/recordActionShown", err));
      if (logRowId) {
        (finalResult as TodayAction & { log_row_id?: string }).log_row_id = logRowId;
      }

      if (supabase) {
        upsertTodayActionCache(supabase, userId, {
          date: new Date().toISOString().slice(0, 10),
          projectId,
          stage,
          data: { ...finalResult, stage, isAI: true, reflexion_status: reflexionStatus },
          generatedAt: new Date().toISOString(),
          source: "today-action",
        }).catch((err) => logError("today-action/cache", err, { route: "/api/ai/today-action", userId, requestId }));
      }
    }

    return NextResponse.json({ success: true, data: { ...finalResult, stage, reflexion_status: reflexionStatus, intelligence: founderIntelligence ? summarizeFounderIntelligenceForClient(founderIntelligence) : undefined } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Today action failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
