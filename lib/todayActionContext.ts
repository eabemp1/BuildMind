/**
 * lib/todayActionContext.ts
 *
 * Single source of truth for loading the context that both today-action
 * routes need before they can build their respective prompts.
 *
 * Previously this ~300-line block was copy-pasted across:
 *   app/api/ai/today-action/route.ts            (non-stream fallback)
 *   app/api/ai/today-action/stream/route.ts      (primary SSE path)
 *
 * Both routes now call loadTodayActionContext() and receive the same typed
 * result. Each route still owns its own prompt templates, Reflexion
 * invocation, and response shape — only the pure data-fetching is shared.
 *
 * SERVER-SIDE ONLY — imports server-only libs (admin client, cognition).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { buildArchetypeSystemContext } from "@/lib/founderArchetype";
import { inferStage } from "@/lib/stages";
import { fetchNotionContext, formatNotionContextForPrompt } from "@/lib/integrations/notion";
import { fetchLinearContext, formatLinearContextForPrompt } from "@/lib/integrations/linear";
import type { ReflexionContext } from "@/lib/reflexion";

/**
 * Maps the Today page's energy check-in vocabulary ("low" | "normal" |
 * "high") to ReflexionContext's expected vocabulary ("fresh" | "drained" |
 * "autopilot"). No other writer of founder_context.cognitive_load exists —
 * only the Today page, and only ever with low/normal/high — so without this
 * mapping the raw value never matched anything downstream: the prompt text
 * was literally interpolating "low"/"normal"/"high" where "Cognitive state
 * today: X" expected the other vocabulary, and reflexion.ts's
 * `ctx.cognitiveLoad !== "fresh"` complexity-scoring check fired
 * unconditionally for every real value a founder could pick.
 */
function mapEnergyToCognitiveLoad(raw: unknown): ReflexionContext["cognitiveLoad"] {
  if (raw === "low") return "drained";
  // "normal" and "high" both map to "fresh" for now — there's no "high
  // energy, assign something harder" concept in reflexion.ts's current
  // vocabulary. Worth a real product decision later, not assumed here.
  if (raw === "normal" || raw === "high") return "fresh";
  return "fresh";
}
import {
  buildDebtPromptInjection,
  computeExecutionDebt,
  debtSuppressesTask,
  markDebtSurfaced,
  type ExecutionDebt,
} from "@/lib/executionDebt";
import { buildKnowledgeBaseContext, searchFounderKnowledgeBase, type FounderKnowledgeMatch } from "@/lib/founderKnowledgeBase";
import { loadCognitionInput, synthesizeFounderCognition, buildCognitionPromptBlock } from "@/lib/founderCognition";
import { buildTodayPersonalisationContext } from "@/lib/todayPersonalisationContext";
import { loadFounderIntelligence, buildFounderIntelligencePromptBlock, summarizeFounderIntelligenceForClient, type FounderIntelligenceState } from "@/lib/founderIntelligence";
import { recordFounderIntelligencePrediction } from "@/lib/learningLoop";
import { buildStartupRelationshipGraph, traceRelationshipChain } from "@/lib/founderRelationships";
import { buildCofounderJudgment, buildCofounderJudgmentPromptBlock } from "@/lib/cofounderJudgment";
import { logError } from "@/lib/server/logger";
import { recordActivity } from "@/lib/server/activityLog";

export interface TodayActionContext {
  // Project data
  stage: string;
  targetUsers: string;
  problem: string;
  title: string;
  description: string;
  projectContext: string;

  // Prompt blocks — pre-assembled, ready for template injection
  lastReflectionContext: string;
  debtContext: string;
  cognitionBlock: string;
  founderIntelligencePromptBlock: string;

  // Structured objects for logic beyond prompt injection
  founderArchetype: string | undefined;
  founderCountry: string | undefined;
  knowledgeMatches: FounderKnowledgeMatch[];
  cognitionMomentumScore: number;
  cognitionAvoidanceSignals: string[];
  cognitionCognitiveLoad: ReflexionContext["cognitiveLoad"];
  lastReflectionNote: string | undefined;
  personalisationCtx: {
    recentActionsBlock: string;
    recentReflectionsBlock: string;
    recurringBlockers: string[];
    activeGoals: string[];
  };
  founderIntelligence: FounderIntelligenceState | null;
  intelligenceSummary: ReturnType<typeof summarizeFounderIntelligenceForClient> | undefined;

  // Debt suppression gate — when truthy the caller should short-circuit and
  // surface the debt interstitial instead of generating a task.
  debtSuppression: {
    suppressed: true;
    category: string;
    message: string;
    interventionHint?: string;
  } | { suppressed: false };

  // The admin client used for loading, so cache writes can reuse it.
  adminClient: ReturnType<typeof createAdminClient> | null;
}

export async function loadTodayActionContext(params: {
  userId: string;
  projectId: string;
  providedStage: string;
  acknowledgeDebt: boolean;
  sessionId: string;
}): Promise<TodayActionContext> {
  const { userId, projectId, providedStage, acknowledgeDebt, sessionId } = params;

  const ctx: TodayActionContext = {
    stage: providedStage || "Idea",
    targetUsers: "",
    problem: "",
    title: "",
    description: "",
    projectContext: "",
    lastReflectionContext: "",
    debtContext: "",
    cognitionBlock: "",
    founderIntelligencePromptBlock: "",
    founderArchetype: undefined,
    founderCountry: undefined,
    knowledgeMatches: [],
    cognitionMomentumScore: 50,
    cognitionAvoidanceSignals: [],
    cognitionCognitiveLoad: "fresh",
    lastReflectionNote: undefined,
    personalisationCtx: { recentActionsBlock: "", recentReflectionsBlock: "", recurringBlockers: [], activeGoals: [] },
    founderIntelligence: null,
    intelligenceSummary: undefined,
    debtSuppression: { suppressed: false },
    adminClient: null,
  };

  if (!hasAdminEnv()) return ctx;

  const supabase = createAdminClient();
  ctx.adminClient = supabase;

  // ── 1. Project + founder memory + context ──────────────────────────────
  const [projectResult, memoryResult, contextResult] = await Promise.allSettled([
    supabase
      .from("projects")
      .select("name, title, description, target_users, problem, startup_stage, biggest_blocker, created_at, current_mrr")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("founder_memory")
      .select("avoidance_zones, strengths, last_insight, personality_tags, decision_patterns, last_debt_surfaced, cofounder_style, archetype_confidence, last_week_summary")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("founder_context")
      .select("avoidance_zones, override_reasons, tasks_overridden_this_week, topics_mentioned_repeatedly, days_inactive, streak, last_checkin_date, tasks_completed_total, consecutive_tasks_completed, country")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const project = projectResult.status === "fulfilled" ? projectResult.value.data : null;
  const memory = memoryResult.status === "fulfilled" ? memoryResult.value.data : null;
  const founderContextRow = contextResult.status === "fulfilled" ? contextResult.value.data : null;
  ctx.founderCountry = (founderContextRow as { country?: string } | null)?.country ?? undefined;

  if (project) {
    // ── Milestones + tasks, with completion stats and an inferStage() fallback
    // for projects whose startup_stage hasn't been explicitly set. ─────────
    const { data: milestones } = await supabase
      .from("milestones")
      .select("id, title, status")
      .eq("project_id", projectId)
      // order_index is the roadmap-generation-assigned sequence (see
      // generate-roadmap/route.ts); created_at is only a tiebreak for rows
      // sharing the same order_index.
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });

    const milestoneIds = (milestones ?? []).map((m) => m.id);
    let allTasks: Array<{ title: string; is_completed: boolean; milestone_id: string; priority: number | null }> = [];
    if (milestoneIds.length > 0) {
      // Batch milestone IDs to avoid URL length limits.
      const BATCH_SIZE = 20;
      const batches = [];
      for (let i = 0; i < milestoneIds.length; i += BATCH_SIZE) {
        const batchIds = milestoneIds.slice(i, i + BATCH_SIZE);
        const tasksQuery = supabase.from("tasks").select("title, is_completed, milestone_id, priority");
        batches.push(batchIds.length === 1 ? tasksQuery.eq("milestone_id", batchIds[0]) : tasksQuery.in("milestone_id", batchIds));
      }
      const batchResults = await Promise.all(batches);
      for (const result of batchResults) {
        if (result.data) allTasks = allTasks.concat(result.data);
      }
      // Each batch comes back in whatever order Postgres feels like, so sort
      // by priority (lower = more urgent — see generate-roadmap/route.ts)
      // before any .slice(0, N) downstream picks "the next" tasks.
      allTasks.sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5));
    }
    const tasks = allTasks;

    const completedTasks = tasks.filter((t) => t.is_completed).length;
    const totalTasks = tasks.length;
    const completedMilestones = (milestones ?? []).filter((m) => m.status === "completed").length;

    ctx.stage = project.startup_stage ?? inferStage(completedTasks, totalTasks, completedMilestones, (milestones ?? []).length) ?? providedStage ?? "Idea";
    ctx.targetUsers = project.target_users ?? "";
    ctx.problem = project.problem ?? "";
    ctx.title = (project.name ?? project.title) ?? "";
    ctx.description = project.description ?? "";

    const pendingMilestonesList = (milestones ?? []).filter((m) => m.status !== "completed").map((m) => m.title ?? "").slice(0, 5);
    const pendingTasksList = tasks.filter((t) => !t.is_completed).map((t) => t.title).slice(0, 5);
    const completionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Surface the onboarding blocker in the first 3 days so the first
    // actions directly address what the founder said was their biggest
    // challenge at signup.
    const projectCreatedAt = project.created_at ? new Date(project.created_at) : null;
    const daysSinceOnboarding = projectCreatedAt ? Math.floor((Date.now() - projectCreatedAt.getTime()) / 86400000) : 999;
    const onboardingBlockerLine = project.biggest_blocker && daysSinceOnboarding <= 3
      ? `\nFOUNDER'S STATED BLOCKER AT ONBOARDING: "${project.biggest_blocker}"\n→ This is what they said their biggest challenge was. Today's task must directly address or reduce this blocker. Reference it explicitly in the rationale.`
      : "";

    // Notion / Linear context injection — pulls the founder's real task
    // list so the AI doesn't suggest work they're already doing elsewhere.
    let integrationContext = "";
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

    ctx.projectContext = `Project: ${ctx.title}\nStage: ${ctx.stage}\nProblem: ${ctx.problem || "Not specified"}\nTarget users: ${ctx.targetUsers || "Not specified"}\nDescription: ${ctx.description || "Not specified"}\nOverall progress: ${completedTasks}/${totalTasks} tasks done (${completionPct}%), ${completedMilestones}/${(milestones ?? []).length} milestones complete\nPending milestones (next to tackle): ${pendingMilestonesList.length ? pendingMilestonesList.join(", ") : "None"}\nNext open tasks: ${pendingTasksList.length ? pendingTasksList.join(", ") : "None"}\nCurrent MRR: ${project.current_mrr && project.current_mrr > 0 ? `GHS ${(project.current_mrr / 100).toFixed(0)} / month` : "GHS 0 (pre-revenue)"}${project.current_mrr && project.current_mrr > 0 ? "\n→ This founder has paying customers. Tasks must prioritize retention, upsell, and reducing churn over acquisition." : "\n→ This founder has no revenue yet. Every task should move them closer to a first paying customer."}${onboardingBlockerLine}${integrationContext}`;
  }

  if (memory) {
    const avoidance = (memory.avoidance_zones ?? []) as string[];
    const strengths = (memory.strengths ?? []) as string[];
    const lastInsight = memory.last_insight as string | null;
    const lastWeekSummaryRaw = (memory as Record<string, unknown>).last_week_summary as string | null;
    ctx.founderArchetype = ((memory.personality_tags ?? []) as string[])
      .find((tag) => tag.startsWith("archetype:"))
      ?.replace("archetype:", "");

    if (avoidance.length || strengths.length || lastInsight) {
      ctx.lastReflectionContext += `\n\nFOUNDER MEMORY (behavioral profile — use to shape the task):`;
      if (avoidance.length) {
        ctx.lastReflectionContext += `\nConsistently avoids: ${avoidance.join(", ")}`;
        ctx.lastReflectionContext += `\n→ If today's best task falls in an avoidance zone, name the pattern directly and assign it anyway. Don't route around it.`;
      }
      if (strengths.length) {
        ctx.lastReflectionContext += `\nStrong at: ${strengths.join(", ")} — lean on these where relevant`;
      }
      if (lastInsight) {
        ctx.lastReflectionContext += `\nLast observed pattern: "${lastInsight}"`;
      }
    }
    const archetypeContext = buildArchetypeSystemContext((memory.personality_tags ?? []) as string[]);
    if (archetypeContext) ctx.lastReflectionContext += `\n\n${archetypeContext}`;

    // On Mondays, inject last week's summary as causal context for today's task.
    const isMonday = new Date().getDay() === 1;
    if (isMonday && lastWeekSummaryRaw) {
      try {
        const lastWeek = JSON.parse(lastWeekSummaryRaw) as {
          tasks_completed?: number; avg_confidence?: number;
          biggest_gap?: string; next_week_focus?: string;
          intention_vs_execution_rate?: number; execution_trend?: string;
          avoidance_summary?: string; override_count?: number;
        };
        ctx.lastReflectionContext += `\n\nLAST WEEK SUMMARY (Monday — use this to set today's direction):`;
        ctx.lastReflectionContext += `\nCompleted ${lastWeek.tasks_completed ?? 0} tasks. Avg confidence: ${lastWeek.avg_confidence ?? "?"}/5`;
        if (lastWeek.intention_vs_execution_rate != null) {
          ctx.lastReflectionContext += `\nIntention vs execution rate: ${lastWeek.intention_vs_execution_rate}% (${lastWeek.execution_trend ?? "flat"} trend)`;
        }
        if (lastWeek.override_count != null && lastWeek.override_count > 0) {
          ctx.lastReflectionContext += `\nOverrode/blocked ${lastWeek.override_count} tasks last week.`;
        }
        if (lastWeek.avoidance_summary) ctx.lastReflectionContext += `\nAvoidance patterns detected: "${lastWeek.avoidance_summary}"`;
        if (lastWeek.biggest_gap) ctx.lastReflectionContext += `\nBiggest gap last week: "${lastWeek.biggest_gap}"`;
        if (lastWeek.next_week_focus) ctx.lastReflectionContext += `\nFocused direction for this week: "${lastWeek.next_week_focus}"`;
        ctx.lastReflectionContext += `\nINSTRUCTION: Monday's first task must directly address the biggest gap from last week. If override rate was high last week (avg confidence <3 or intention_vs_execution_rate <50%), start with an easier confidence-building task that routes around the detected avoidance patterns.`;
      } catch { /* non-fatal — malformed JSON in last_week_summary */ }
    }
  }

  // ── 2. Execution debt ──────────────────────────────────────────────────
  if (memoryResult.status === "fulfilled" && contextResult.status === "fulfilled") {
    const m = (memoryResult.value.data ?? {}) as {
      avoidance_zones?: string[];
      decision_patterns?: unknown[];
      personality_tags?: string[];
      last_debt_surfaced?: Record<string, string> | null;
    };
    const c = (contextResult.value.data ?? {}) as {
      avoidance_zones?: string[];
      override_reasons?: string[];
      tasks_overridden_this_week?: number;
      topics_mentioned_repeatedly?: string[];
      days_inactive?: number;
    };
    const debt: ExecutionDebt = computeExecutionDebt(
      {
        avoidance_zones: c.avoidance_zones ?? [],
        override_reasons: c.override_reasons ?? [],
        tasks_overridden_this_week: c.tasks_overridden_this_week ?? 0,
        topics_mentioned_repeatedly: c.topics_mentioned_repeatedly ?? [],
        days_inactive: c.days_inactive ?? 0,
      },
      {
        avoidance_zones: m.avoidance_zones ?? [],
        decision_patterns: [],
        personality_tags: m.personality_tags ?? [],
        last_debt_surfaced: m.last_debt_surfaced ?? null,
      },
    );
    ctx.debtContext = buildDebtPromptInjection(debt);

    if (debtSuppressesTask(debt) && !acknowledgeDebt) {
      await markDebtSurfaced(userId, debt);
      ctx.debtSuppression = {
        suppressed: true,
        category: debt.category ?? "unknown",
        message: debt.message,
        interventionHint: debt.interventionHint,
      };
      return ctx; // caller short-circuits; no further loading needed
    }
    if (acknowledgeDebt) {
      recordActivity(userId, "task_overridden", { projectId, debtCategory: debt.category }).catch(() => {});
    }
  }

  // ── 3. Recent reflection (last 48 h) ───────────────────────────────────
  const { data: lastReflection } = await supabase
    .from("reflections")
    .select("outcome, note, confidence, today_action, created_at, what_tried, what_happened, what_learned, blocker")
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastReflection) {
    const reflectDate = new Date(lastReflection.created_at).toLocaleDateString();
    ctx.lastReflectionNote = lastReflection.note ?? undefined;
    ctx.lastReflectionContext =
      `\nLAST REFLECTION (${reflectDate}):\nYesterday: "${lastReflection.today_action ?? "Not recorded"}"\nOutcome: ${lastReflection.outcome}\nConfidence: ${lastReflection.confidence}/5\nNote: "${lastReflection.note ?? "None"}"\n` +
      `${lastReflection.what_tried ? `What they actually tried: "${lastReflection.what_tried}"\n` : ""}` +
      `${lastReflection.what_happened ? `What concretely happened: "${lastReflection.what_happened}"\n` : ""}` +
      `${lastReflection.what_learned ? `What they learned: "${lastReflection.what_learned}"\n` : ""}` +
      `${lastReflection.blocker ? `Specific blocker: "${lastReflection.blocker}"\n` : ""}` +
      `INSTRUCTION: Use what_tried and what_happened as the PRIMARY signal. If what_tried is set, today must be a direct causal response. blocked+blocker -> remove the specific blocker first. what_learned -> apply to one real person today.` +
      ctx.lastReflectionContext;
  }

  // ── 4. Recent action history (dedup block) ─────────────────────────────
  try {
    const { data: recentRows } = await supabase
      .from("reflections")
      .select("outcome, note, today_action, created_at")
      .eq("user_id", userId)
      .not("today_action", "is", null)
      .order("created_at", { ascending: false })
      .limit(8);

    const lines = (recentRows ?? [])
      .filter((r: { today_action?: string | null }) => r.today_action)
      .map((r: { outcome?: string; note?: string; today_action?: string }, i: number) => {
        const note = r.note ? ` | note: ${String(r.note).slice(0, 120)}` : "";
        return `${i + 1}. "${r.today_action}" -> ${r.outcome ?? "unknown"}${note}`;
      });

    // Also inject the current cached task as a "replaced" history entry.
    // When the founder replaces a task without completing it, no reflection
    // is written, so the AI has no memory of having shown that task before
    // — this creates the stale-task loop (same task repeating for 2+ weeks).
    try {
      const { data: cacheRow } = await supabase
        .from("user_behavior_state")
        .select("value")
        .eq("user_id", userId)
        .eq("key", "today_action_cache")
        .maybeSingle();
      const cachedTask = cacheRow?.value as { data?: { action?: string }; shown_count?: number } | null;
      if (cachedTask?.data?.action) {
        const shownCount = cachedTask.shown_count ?? 1;
        lines.push(`[REPLACED/SKIPPED ${shownCount}x without completion]: "${cachedTask.data.action}" -> replaced`);
      }
    } catch { /* non-fatal */ }

    if (lines.length) {
      ctx.lastReflectionContext += `\n\nRECENT ACTION HISTORY (do not repeat these task shapes or messages):\n${lines.join("\n")}\nInstruction: today's action must be a new next move. Change the person, channel, ask, experiment, or success criterion. Never reuse previous outreach copy.`;
    }
  } catch { /* non-fatal */ }

  // ── 5. Cognition synthesis ─────────────────────────────────────────────
  if (ctx.title || ctx.projectContext) {
    try {
      const cognitionInput = await loadCognitionInput(userId, ctx.stage, ctx.title);
      const cognitionState = await synthesizeFounderCognition(userId, cognitionInput);
      ctx.cognitionBlock = buildCognitionPromptBlock(cognitionState);
      ctx.cognitionMomentumScore = cognitionState.signal_confidence > 0.3
        ? (cognitionInput.context?.momentum_score ?? 50)
        : 50;
      ctx.cognitionAvoidanceSignals = cognitionInput.memory?.avoidance_zones ?? [];
      // The Today page's energy check-in writes "low" | "normal" | "high",
      // but ReflexionContext expects "fresh" | "drained" | "autopilot" — no
      // other writer of this column exists, so the raw value never matched
      // ReflexionContext's vocabulary before this mapping existed.
      ctx.cognitionCognitiveLoad = mapEnergyToCognitiveLoad(cognitionInput.context?.cognitive_load);
    } catch (err) {
      logError("todayActionContext/cognition", err, { userId });
    }
  }

  // ── 6. Knowledge base retrieval ────────────────────────────────────────
  if (ctx.title || ctx.problem || ctx.targetUsers) {
    try {
      ctx.knowledgeMatches = await searchFounderKnowledgeBase(
        `${ctx.title}. ${ctx.problem}. ${ctx.targetUsers}. ${ctx.projectContext}`.trim(),
        ctx.stage,
        ctx.founderArchetype,
        0,
      );
      const knowledgeContext = buildKnowledgeBaseContext(ctx.knowledgeMatches, ctx.founderArchetype);
      if (knowledgeContext) ctx.lastReflectionContext += `\n\n${knowledgeContext}`;
    } catch (err) {
      logError("todayActionContext/knowledge", err, { userId });
    }
  }

  // ── 7. Personalisation context ─────────────────────────────────────────
  if (projectId) {
    try {
      ctx.personalisationCtx = await buildTodayPersonalisationContext(userId, projectId);
    } catch (err) {
      logError("todayActionContext/personalisation", err, { userId });
    }
  }

  // ── 8. Founder Intelligence OS coherence layer ─────────────────────────
  try {
    ctx.founderIntelligence = await loadFounderIntelligence(supabase, userId, projectId, { now: new Date() });
    ctx.founderIntelligencePromptBlock = buildFounderIntelligencePromptBlock(ctx.founderIntelligence);
    ctx.founderIntelligencePromptBlock += `\n\n${buildCofounderJudgmentPromptBlock(buildCofounderJudgment(ctx.founderIntelligence))}`;
    ctx.intelligenceSummary = summarizeFounderIntelligenceForClient(ctx.founderIntelligence);

    try {
      const [projectGraphRes, milestonesGraphRes, tasksGraphRes, reflectionsGraphRes] = await Promise.allSettled([
        supabase.from("projects").select("*").eq("id", projectId).eq("user_id", userId).maybeSingle(),
        supabase.from("milestones").select("*").eq("project_id", projectId).eq("user_id", userId).order("created_at", { ascending: true }).limit(30),
        supabase.from("tasks").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(80),
        supabase.from("reflections").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(80),
      ]);
      const data = <T,>(res: PromiseSettledResult<{ data: T }>, fallback: T): T =>
        res.status === "fulfilled" ? (res.value.data ?? fallback) : fallback;
      const graph = buildStartupRelationshipGraph({
        project: data(projectGraphRes as PromiseSettledResult<{ data: Record<string, any> | null }>, null),
        milestones: data(milestonesGraphRes as PromiseSettledResult<{ data: Array<Record<string, any>> }>, []),
        tasks: data(tasksGraphRes as PromiseSettledResult<{ data: Array<Record<string, any>> }>, []),
        reflections: data(reflectionsGraphRes as PromiseSettledResult<{ data: Array<Record<string, any>> }>, []),
      }, ctx.founderIntelligence);
      const chain = traceRelationshipChain(
        graph,
        ctx.founderIntelligence.startup.stalled_milestones[0] ?? ctx.founderIntelligence.startup.active_milestones[0] ?? null,
      );
      if (chain.narrative && chain.path.length) {
        ctx.founderIntelligencePromptBlock += `\n\nSTARTUP RELATIONSHIP TRACE (goal-to-evidence chain):\n${chain.narrative}\nInstruction: Today's recommendation must connect to this chain or explicitly explain why a different chain has become more important.`;
      }
    } catch (err) {
      logError("todayActionContext/relationshipGraph", err, { userId, projectId });
    }

    if (ctx.founderIntelligence.decision.top_candidate) {
      recordFounderIntelligencePrediction(supabase, {
        userId,
        projectId,
        stage: ctx.stage,
        sessionId,
        candidate: ctx.founderIntelligence.decision.top_candidate,
        alternatives: ctx.founderIntelligence.decision.candidates.slice(1, 4),
      }).catch(() => {});
    }
  } catch (err) {
    logError("todayActionContext/founderIntelligence", err, { userId });
  }

  return ctx;
}
