import { NextResponse } from "next/server";
import { z } from "zod";
import { createUserNotification, enforceAndTrackAIUsage, groqJSON, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { logError } from "@/lib/server/logger";
import type { FounderMemory } from "@/lib/founderMemory";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30; // single JSON LLM call with context assembly ~5–15 s
import { inferStage } from "@/lib/stages";
import { detectSpiralFull } from "@/lib/cofounder/spiralDetection";
import { injectContinuityIntoSystemPrompt, recordInteractionServer, type RecentInteraction } from "@/lib/conversationContinuity";
import { evaluateAIOutput } from "@/lib/aiEvaluator";
import { getPromptForRequest, loadActivePrompts } from "@/lib/promptRegistry";
import { getFounderScorecard } from "@/lib/scorecard";

const FREE_COACH_MESSAGES_PER_DAY = 3;

function dayKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

async function enforceCoachUsage(userId: string, plan: string) {
  if (plan !== "free") {
    await enforceAndTrackAIUsage(userId, plan);
    return;
  }
  if (!hasAdminEnv()) return;

  const supabase = createAdminClient();
  const month = `coach:${dayKey()}`;

  // Atomic increment + cap check — avoids the SELECT→UPDATE race condition.
  const { data: newCount, error: rpcError } = await supabase.rpc("increment_ai_usage_capped", {
    p_user_id: userId,
    p_month: month,
    p_limit: FREE_COACH_MESSAGES_PER_DAY,
  });

  if (rpcError) throw new Error(rpcError.message);

  if (newCount === -1) {
    throw new Error(`LIMIT_REACHED:coach:That's your 3 AI Coach messages for today. More tomorrow — or upgrade to Builder to keep going right now.`);
  }
}

function buildFounderMemoryContext(memory: FounderMemory | null): string {
  if (!memory) return "";
  const lines: string[] = [];
  if (memory.personality_tags?.length)
    lines.push(`Founder personality: ${memory.personality_tags.join(", ")}`);
  if (memory.avoidance_zones?.length)
    lines.push(`Consistently avoids: ${memory.avoidance_zones.join(", ")} — call this out if relevant`);
  if (memory.strengths?.length)
    lines.push(`Strong at: ${memory.strengths.join(", ")}`);
  if (memory.last_insight)
    lines.push(`Last pattern observed: "${memory.last_insight}"`);
  if (memory.cofounder_style)
    lines.push(`Communication style to use: ${memory.cofounder_style}`);
  // REC 2.5: Include topics mentioned repeatedly for proactive observation
  const topicsRepeated = (memory as Record<string, unknown>).topics_mentioned_repeatedly as string[] | undefined;
  if (topicsRepeated?.length)
    lines.push(`Topics mentioned repeatedly without action: ${topicsRepeated.join(", ")}`);
  if (!lines.length) return "";
  return "\n\nFOUNDER MEMORY (persistent — do not repeat back verbatim, just let it inform your tone and advice):\n" + lines.join("\n");
}

// REC 2.5: Build the proactive observation the coach leads with before answering.
// This is the distinction between consulting (answering questions) and coaching (noticing patterns).
function buildProactiveObservation(memory: FounderMemory | null, currentMessage: string): string {
  if (!memory) return "";
  const avoidance = memory.avoidance_zones ?? [];
  const topicsRepeated = ((memory as Record<string, unknown>).topics_mentioned_repeatedly as string[] | undefined) ?? [];
  const lastInsight = memory.last_insight ?? "";

  // Don't surface the same topic they're already asking about
  const messageLower = currentMessage.toLowerCase();
  const unreaisedAvoidance = avoidance.find((z: string) => !messageLower.includes(z.toLowerCase()));
  const unreaisedTopic = topicsRepeated.find((t: string) => !messageLower.includes(t.toLowerCase()));

  const observations: string[] = [];
  if (unreaisedAvoidance) observations.push(`You've been avoiding ${unreaisedAvoidance} consistently`);
  if (unreaisedTopic) observations.push(`You've mentioned ${unreaisedTopic} multiple times without acting on it`);
  if (lastInsight && !messageLower.includes(lastInsight.toLowerCase().slice(0, 20))) {
    // Truncate to the first sentence to avoid bloating prompt instructions with
    // a full multi-sentence AI-generated paragraph (audit finding §2.5).
    const firstSentence = lastInsight.split(/(?<=[.!?])\s+/)[0] ?? lastInsight;
    const truncated = firstSentence.length > 120 ? firstSentence.slice(0, 120).trimEnd() + "…" : firstSentence;
    observations.push(truncated);
  }

  if (!observations.length) return "";

  // Pick the most interesting unraised observation
  const obs = observations[0];
  return `\n\nPROACTIVE COACHING INSTRUCTION: Before answering the founder's question, open with one direct observation from their behavioral profile that they have NOT raised in this message. Do not ask a question — make a statement. Example format: "Before you ask — [observation]. What's actually blocking that?" The observation to use: "${obs}"`;
}

// ── Spiral detection — the patterns that signal a founder is collapsing ───────
// Kept server-side so the detection logic cannot be bypassed client-side.
type SpiralSignal = "competitor" | "motivation" | "avoidance" | null;

function detectSpiralSignal(message: string): { detected: boolean; signal: SpiralSignal } {
  const triggers: { pattern: RegExp; signal: SpiralSignal }[] = [
    { pattern: /someone (is already|already|just) (doing|built|building|launched|shipped)/i, signal: "competitor" },
    { pattern: /(they already have|there'?s already a) (this|that|something like|an app|a tool)/i, signal: "competitor" },
    { pattern: /too late (to|for)/i, signal: "competitor" },
    { pattern: /what'?s the point/i, signal: "motivation" },
    { pattern: /i (don'?t|do not) see the point/i, signal: "motivation" },
    { pattern: /why (am i|bother|even)/i, signal: "motivation" },
    { pattern: /nobody (cares|will use|wants)/i, signal: "motivation" },
    { pattern: /this (is|was) a (bad|stupid|dumb|terrible) idea/i, signal: "motivation" },
    { pattern: /i should (just )?give up/i, signal: "motivation" },
    { pattern: /maybe i should (pivot|quit|stop|abandon)/i, signal: "motivation" },
    { pattern: /i keep (putting off|avoiding|procrastinating)/i, signal: "avoidance" },
    { pattern: /haven'?t (touched|worked on|opened|started)/i, signal: "avoidance" },
    { pattern: /i'?m stuck (on|at|with)/i, signal: "avoidance" },
    { pattern: /can'?t bring myself to/i, signal: "avoidance" },
  ];
  for (const { pattern, signal } of triggers) {
    if (pattern.test(message)) return { detected: true, signal };
  }
  return { detected: false, signal: null };
}

function buildSpiralInstruction(signal: SpiralSignal, message: string): string {
  if (!signal) return "";
  if (signal === "competitor") {
    return `\n\nSPIRAL ALERT — COMPETITOR: The founder is in a competitor spiral. Before anything else:
1. Acknowledge the competitor is real — do NOT dismiss it
2. Name a specific gap that competitor has NOT solved for this founder's exact target user
3. Reframe: competitors = proof of market. Use their user count as evidence.
4. Give ONE 20-minute task to differentiate, not "don't worry about it"
Be direct, not reassuring. The goal is to redirect energy, not comfort.`;
  }
  if (signal === "motivation") {
    return `\n\nSPIRAL ALERT — MOTIVATION: The founder is questioning the point. Before anything else:
1. Name exactly what they've done (even if small) — not to celebrate, to remind them it's real
2. Identify if this is a real signal (bad idea) or temporary noise (rough day)
3. If it's noise: one concrete re-entry task, under 30 minutes
4. If it might be real: ask the one question that will distinguish noise from signal
Do NOT say "believe in yourself." Do NOT dismiss the feeling.`;
  }
  if (signal === "avoidance") {
    return `\n\nSPIRAL ALERT — AVOIDANCE: The founder is in an avoidance pattern. Before anything else:
1. Name the avoidance directly — "You're describing a pattern, not a problem"
2. Break the avoided task into its smallest possible first step (under 15 min)
3. Ask: "Is this hard because it's actually hard, or because you're afraid of the feedback?"
4. Give them a timer — "Do 10 minutes of it right now, then come back"
Be firm. Avoidance compounds. Interrupting it early is the job.`;
  }
  return "";
}


const CoachBodySchema = z.object({
  userId:       z.string().optional(),
  projectId:    z.string().optional(),
  message:      z.string().max(2000).optional(),
  blockerType:  z.string().max(200).optional(),
  domain:       z.string().max(200).optional(),
  messages:     z.array(z.object({ role: z.string().optional(), content: z.string().optional() })).optional(),
});

export async function POST(request: Request) {
  try {
    void loadActivePrompts();
    const routeUser = await getRouteUser();
    if (!routeUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => ({}));
    const zodResult = CoachBodySchema.safeParse(rawBody);
    const body = zodResult.success ? zodResult.data : rawBody;
    const userId = String(body?.userId ?? routeUser.userId).trim();
    const projectId = String(body?.projectId ?? body?.project?.id ?? "").trim();
    // Input length limits — prevent prompt injection and runaway token costs
    const message = String(body?.message ?? "").trim().slice(0, 2000);
    const blockerType = String(body?.blockerType ?? "").trim().slice(0, 200);
    const domain = String(body?.domain ?? "").trim().slice(0, 200);
    const history = Array.isArray(body?.messages)
      ? (body.messages as { role?: string; content?: string }[])
          .map((m) => ({ role: (m?.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: String(m?.content ?? "").trim().slice(0, 1000) }))
          .filter((m) => m.content)
          .slice(-8)
      : [];

    if (userId !== routeUser.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!userId || !projectId) {
      return NextResponse.json({ success: false, error: "userId and projectId required" }, { status: 400 });
    }

    await enforceCoachUsage(userId, routeUser.plan);

    // ── Spiral detection (server-side, plan-gated) ──────────────────────────
    const { detected: spiralDetected, signal: spiralSignal } = detectSpiralSignal(message);

    let projectContext = "";
    let stage = "MVP";
    let founderMemoryContext = "";
    let memory: FounderMemory | null = null;
    let lastMorningNote = "";
    let confidenceScore: number | null = null;
    let recentInteractions: RecentInteraction[] = [];
    let scorecardContext = "";

    // supabase client is needed outside the hasAdminEnv block for recordInteractionServer
    const supabase = hasAdminEnv() ? createAdminClient() : null;

    if (hasAdminEnv() && supabase) {
      try {
        // ── Real scorecard — single source of truth, see lib/scorecard.ts ────
        // Fetched independently of the Promise.allSettled below (which is
        // project-scoped) since momentum/streak/xp are founder-scoped, not
        // project-scoped. Without this, the model was inferring "momentum"
        // from task/milestone completion ratios and presenting that guess
        // as if it were the real momentum_score — a fabricated number that
        // coincidentally sounds authoritative because it's phrased as a fact.
        const scorecardPromise = getFounderScorecard(userId).catch(() => null);

        const [projectResult, memoryResult, milestonesResult, profileResult, scorecardResult] = await Promise.allSettled([
          supabase
            .from("projects")
            .select("name, title, description, target_users, problem, startup_stage, validation_strengths, validation_weaknesses")
            .eq("id", projectId)
            .eq("user_id", userId)
            .maybeSingle(),
          supabase.from("founder_memory").select("*").eq("user_id", userId).maybeSingle(),
          supabase.from("milestones").select("id, title, status").eq("project_id", projectId),
          // Task 5: fetch recent_interactions to extract today's morning note
          // NOTE: recent_interactions lives on founder_context (migration 20260517000000), not profiles
          supabase.from("founder_context").select("recent_interactions").eq("user_id", userId).maybeSingle(),
          scorecardPromise,
        ]);

        const project = projectResult.status === "fulfilled" ? projectResult.value.data : null;
        memory = memoryResult.status === "fulfilled" ? memoryResult.value.data as FounderMemory | null : null;
        const milestones = milestonesResult.status === "fulfilled" ? milestonesResult.value.data ?? [] : [];

        const scorecard = scorecardResult.status === "fulfilled" ? scorecardResult.value : null;
        if (scorecard) {
          scorecardContext = `\nMomentum score: ${scorecard.momentum}/100 (${scorecard.momentumLabel.label})\nActive streak: ${scorecard.streak} day${scorecard.streak === 1 ? "" : "s"}\nLifetime XP: ${scorecard.xp}\nExecution score: ${scorecard.executionScore}/100\n\nIMPORTANT: The momentum score above (${scorecard.momentum}/100) is the ONLY correct value for "momentum score" — a specific, named metric independent of task or milestone completion percentages. Never compute or state a different "momentum score" from task/milestone ratios; those are separate metrics you may mention by their own names (e.g. "task completion rate") but must not relabel as momentum.`;
        }

        // Task 5: extract today's morning note from recent_interactions
        const profileInteractions = profileResult.status === "fulfilled"
          ? (profileResult.value.data?.recent_interactions as Array<{ type?: string; note?: string; timestamp?: string }> | null) ?? []
          : [];
        const todayUTC = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
        const todayMorningCheckin = profileInteractions.find(
          (r) => r.type === "morning_checkin" && r.timestamp?.startsWith(todayUTC),
        );
        if (todayMorningCheckin?.note) {
          lastMorningNote = todayMorningCheckin.note;
        }
        recentInteractions = profileInteractions as RecentInteraction[];

        const milestoneIds = milestones.map((m) => m.id);
      
        // Batch milestone IDs to avoid URL length limits
        let allTasks: Array<{ title: string; is_completed: boolean }> = [];
        if (milestoneIds.length > 0) {
          const BATCH_SIZE = 20;
          const batches = [];
          for (let i = 0; i < milestoneIds.length; i += BATCH_SIZE) {
            const batchIds = milestoneIds.slice(i, i + BATCH_SIZE);
            const tasksQuery = supabase.from("tasks").select("title, is_completed");
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
        const completedMilestones = milestones.filter((m) => m.status === 'completed').length;

        if (project) {
          stage = project.startup_stage ?? inferStage(completedTasks, totalTasks, completedMilestones, milestones.length);
          const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
          const valStrengths = (project.validation_strengths ?? []).join(", ");
          const valWeaknesses = (project.validation_weaknesses ?? []).join(", ");
          projectContext = `
Project: ${project.name ?? project.title}
Stage: ${stage}
Problem: ${project.problem ?? "Not defined"}
Target users: ${project.target_users ?? "Not defined"}
Task completion: ${completedTasks}/${totalTasks} (${completionRate}%)
Milestone completion: ${completedMilestones}/${milestones.length}
Validation strengths: ${valStrengths || "None recorded"}
Validation gaps: ${valWeaknesses || "None recorded"}`;
        }

        founderMemoryContext = buildFounderMemoryContext(memory);

        // ── Persist spiral event to founder_memory for pattern tracking ────────
        if (spiralDetected && memory) {
          const signals = (memory.emotional_signals ?? []) as { trigger: string; type: string; confidence: number }[];
          signals.push({ trigger: message.slice(0, 80), type: "draining", confidence: 0.85 });
          await supabase.from("founder_memory")
            .update({ emotional_signals: signals.slice(-20), updated_at: new Date().toISOString() })
            .eq("user_id", userId);
        }
      } catch (err) {
        console.error("[coach] Optional founder context fetch failed:", err);
      }
    }

    const blockerContext = blockerType
      ? `\n\nFounder flagged a specific blocker: "${blockerType}" — address this directly.`
      : "";
    const domainContext = domain
      ? `\n\nDomain/context they're focused on: ${domain}`
      : "";
    const historyContext = history.length
      ? "\n\nConversation so far:\n" + history.map((m) => `${m.role === "user" ? "Founder" : "Coach"}: ${m.content}`).join("\n")
      : "";

    // ── Spiral instruction injected into system prompt when detected ─────────
    const spiralInstruction = buildSpiralInstruction(spiralSignal, message);

    // REC 2.5: Build proactive observation from founder memory
    const proactiveObservation = buildProactiveObservation(memory, message);

    // AI Improvement #1: Use LLM spiral classifier (not just regex) for nuanced detection
    const spiralResultFull = await detectSpiralFull(message);
    // spiralDetected / spiralSignal are already declared from the regex pass above;
    // if the LLM classifier fires, use its result for the instruction builder.
    const effectiveSpiralSignal: SpiralSignal =
      spiralResultFull.detected && spiralResultFull.detectedBy === "llm"
        ? (spiralResultFull.signal as SpiralSignal)
        : spiralSignal;
    const effectiveSpiralDetected = spiralDetected || (spiralResultFull.detected && spiralResultFull.detectedBy === "llm");

    // Task 1: derive a confidence_score from the quality checks so ConfidenceBadge can render
    // We compute it after project context is assembled — same checks Agent B runs.
    const hasProjectContext   = Boolean(projectContext.trim());
    const hasTargetUsers      = Boolean(body?.targetUsers || projectContext.includes("Target users:") && !projectContext.includes("Target users: Not defined"));
    const hasMemory           = Boolean(memory && (memory.personality_tags?.length || memory.strengths?.length));
    const hasMorningNote      = Boolean(lastMorningNote);
    const rawScore = [hasProjectContext, hasTargetUsers, hasMemory, hasMorningNote].filter(Boolean).length / 4;
    confidenceScore = Math.round(rawScore * 100) / 100; // e.g. 0.75

    // Task 5: inject today's morning note into system prompt so coach has same-day context
    const morningNoteContext = lastMorningNote
      ? `\n\nTODAY'S MORNING INTENTION (founder logged this earlier today): "${lastMorningNote}" — if relevant, connect your coaching to what they said they'd do today.`
      : "";

    const baseSystemPrompt = `You are BuildMind — a direct, honest AI coach for founders. You think like a great co-founder: you have full context on their project, you follow the conversation, and you never give generic advice.

You must return ONLY valid JSON with exactly these two fields:
{
  "reasoning": ["step 1", "step 2", "step 3"],
  "answer": "your response here"
}

The "reasoning" array: 2-4 short internal thinking steps (8-15 words each). Show what you're noticing about this specific founder's situation.

Answer rules:
- READ THE FOUNDER'S MESSAGE FIRST. If they ask a follow-up, answer it directly.
- If they ask something unrelated to their project, engage — then optionally connect back.
- If they ask for your opinion, give it. Do not deflect.
- Only push toward action when it naturally fits.
- Under 200 words. Dense and direct. Never "Great question!" Never filler.
${spiralInstruction}${proactiveObservation}

${projectContext ? `FOUNDER'S REAL DATA:\n${projectContext}${scorecardContext}` : scorecardContext}${founderMemoryContext}${morningNoteContext}${blockerContext}${domainContext}${historyContext}

Founder's message: ${message}

Return ONLY the JSON object. No preamble. No markdown.`;

    // Inject cross-feature continuity block before the base system prompt
    const systemPrompt = injectContinuityIntoSystemPrompt(baseSystemPrompt, recentInteractions);

    const result = await groqJSON<{ reasoning: string[]; answer: string }>(systemPrompt, message);

    const reasoning = Array.isArray(result?.reasoning) && result.reasoning.length > 0
      ? result.reasoning.slice(0, 4).map((r) => String(r).trim()).filter(Boolean)
      : ["Reading your project data...", "Identifying the key constraint...", "Deciding what matters most right now..."];

    const answer = typeof result?.answer === "string" && result.answer.trim().length > 10
      ? result.answer.trim()
      : "BuildMind couldn't generate a response right now. Focus on your most important open task.";

    await createUserNotification(userId, "BuildMind has a new coaching response for you.", "ai_recommendation");

    // Log quality — enables tracking whether coach responses are specific enough
    const { version: promptVersion, variant } = getPromptForRequest("coach_system", userId);
    void evaluateAIOutput({
      userId,
      projectId,
      context: "coach",
      promptId: "coach_system",
      promptVersion,
      variant,
      output: answer,
      founderContext: {
        stage,
        targetUsers: body?.targetUsers as string | undefined,
        archetype: memory?.personality_tags?.find((tag) => tag.startsWith("archetype:"))?.replace("archetype:", ""),
      },
    });

    // AI Improvement #2: record this interaction for cross-feature continuity
    const interactionSummary = answer.slice(0, 120) + (answer.length > 120 ? "…" : "");
    if (supabase) {
      recordInteractionServer(
        supabase as Parameters<typeof recordInteractionServer>[0],
        userId,
        "ai_coach",
        interactionSummary,
        effectiveSpiralDetected ? (effectiveSpiralSignal ?? undefined) : undefined,
      ).catch(() => {}); // fire-and-forget
    }

    // AI Improvement #3: trigger embedding update for tag deduplication
    // (fire-and-forget — never blocks the coach response)
    fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/ai/embed-tags`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
      },
      body: JSON.stringify({ userId }),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: { reasoning, answer, reply: answer, spiralDetected: effectiveSpiralDetected, spiralSignal: effectiveSpiralSignal, confidence_score: confidenceScore },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Coach failed";
    const providerMissing = msg.includes("No AI providers configured") || msg.includes("GROQ_API_KEY");
    const status = msg.toLowerCase().includes("limit") ? 429 : providerMissing ? 503 : 500;
    return NextResponse.json({
      success: false,
      error: msg,
      data: {
        reasoning: ["Encountering an issue...", "Falling back to default guidance..."],
        answer: providerMissing
          ? "AI is not configured yet. Add GROQ_API_KEY, CEREBRAS_API_KEY, or GEMINI_API_KEY to your environment variables."
          : "BuildMind is temporarily unavailable. Your most important task right now: complete the top pending item in your project.",
      },
    }, { status });
  }
}
