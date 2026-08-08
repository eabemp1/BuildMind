/**
 * app/api/ai/today-action/stream/route.ts
 *
 * PATCHES APPLIED (June 2026):
 *  1. systemA — now requests TASK / RATIONALE / DRAFT structured output with concrete
 *     examples showing what "personalised" actually means. Token limit raised 300→600.
 *  2. Agent C — system prompt updated to PRESERVE the TASK/RATIONALE/DRAFT structure
 *     instead of collapsing it to 2-3 sentences. Token limit raised 250→600.
 *  3. parseAgentOutput() — new function that extracts TASK, RATIONALE, DRAFT from the
 *     structured agent output. Replaces buildPersonalizedTodayDraft entirely so the
 *     message field comes from the AI-written draft, not a hardcoded template.
 *  4. localDayKey uses UTC (toISOString().slice(0,10)) to match server-side today.
 */

import { NextResponse } from "next/server";
import { enforceAndTrackAIUsage, hasAdminEnv } from "@/app/api/ai/_utils";
import { logError } from "@/lib/server/logger";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;
import { createAdminClient } from "@/lib/supabase/admin";
import { getWeeklyCriticPersona, groqCall, buildCriticJudgmentRule } from "@/lib/reflexion";
import { buildCofounderJudgment } from "@/lib/cofounderJudgment";
import { callModelJSON, sanitizeModelOutput } from "@/lib/ai-providers";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { buildArchetypeSystemContext } from "@/lib/founderArchetype";
import { buildDebtPromptInjection, computeExecutionDebt, debtSuppressesTask, markDebtSurfaced } from "@/lib/executionDebt";
import { recordActivity } from "@/lib/server/activityLog";
import { buildKnowledgeBaseContext, searchFounderKnowledgeBase, type FounderKnowledgeMatch } from "@/lib/founderKnowledgeBase";
import { loadCognitionInput, synthesizeFounderCognition, buildCognitionPromptBlock } from "@/lib/founderCognition";
import { evaluateAIOutput } from "@/lib/aiEvaluator";
import { getPromptForRequest, loadActivePrompts } from "@/lib/promptRegistry";
import { upsertTodayActionCache } from "@/lib/todayActionCache";
import { buildTodayPersonalisationContext } from "@/lib/todayPersonalisationContext";
import { recordActionShown } from "@/lib/learning";
import { buildFounderIntelligencePromptBlock, loadFounderIntelligence, summarizeFounderIntelligenceForClient, type FounderIntelligenceState } from "@/lib/founderIntelligence";
import { recordFounderIntelligencePrediction } from "@/lib/learningLoop";
import { loadTodayActionContext } from "@/lib/todayActionContext";
import { formatRegionalContextBlock } from "@/lib/regionalContext";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

type TodayAction = {
  action: string;
  platform: string;
  target_user: string;
  message: string;
  why: string;
  time: string;
};

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

function buildFallback(stage: string, targetUsers: string, problem: string, title: string, description = ""): TodayAction {
  const userType = inferProjectAudience(targetUsers, title, description, problem);
  const problemDesc = inferProjectProblem(problem, title, description);
  const productName = title?.trim() || "your product";
  const fallbacks: Record<string, TodayAction> = {
    Idea: {
      action: `Message 3 ${userType} today — no pitch, just ask about ${problemDesc}.`,
      platform: "WhatsApp or LinkedIn",
      target_user: userType,
      message: `Hi [Name], quick question — what's your biggest frustration with ${problemDesc}? I'm researching it and would love 10 minutes.`,
      why: `Every assumption you have about ${userType} is probably wrong. Three real conversations will invalidate more than a week of planning.`,
      time: "1 hour",
    },
    Validation: {
      action: `Send 5 personal DMs to ${userType} — ask about their workflow, not your idea.`,
      platform: "LinkedIn or WhatsApp",
      target_user: userType,
      message: `Hi [Name], how do ${userType} handle ${problemDesc}? Not pitching — genuinely curious.`,
      why: `The Mom Test: ask about their life, not your idea. You'll get honest answers.`,
      time: "1–2 hours",
    },
    MVP: {
      action: `Share ${productName} with 2 ${userType} and watch them use it — don't explain.`,
      platform: "Screen share or in person",
      target_user: userType,
      message: `Hi [Name], I've built something rough to solve ${problemDesc}. Try it for 10 minutes while I watch?`,
      why: `Their confusion is your roadmap. Ship it.`,
      time: "45 minutes",
    },
    Launch: {
      action: `Post ${productName} in one community where ${userType} gather — one honest sentence about ${problemDesc}.`,
      platform: "Twitter/X, LinkedIn, or relevant Slack",
      target_user: userType,
      message: `Built ${productName} to fix ${problemDesc} for ${userType}. It's live. Try it: [link]`,
      why: `Visibility beats perfection.`,
      time: "30 minutes",
    },
    Growth: {
      action: `Call one ${userType} who stopped using ${productName} — ask why, don't defend.`,
      platform: "Phone call",
      target_user: userType,
      message: `Hi [Name], I noticed you stopped using ${productName}. No pitch — just want to understand. 10 minutes?`,
      why: `One churned user teaches you more than 10 new signups.`,
      time: "45 minutes",
    },
    Revenue: {
      action: `Send a direct pricing message to 3 active ${userType} — ask if they'd pay.`,
      platform: "WhatsApp or Email",
      target_user: userType,
      message: `Hi [Name], considering charging for ${productName}. Would [price] feel fair? Be honest.`,
      why: `Willingness-to-pay is the only signal that matters at revenue stage.`,
      time: "30 minutes",
    },
  };
  return fallbacks[stage] ?? fallbacks["Idea"];
}

// ── PATCH 3: parseAgentOutput ────────────────────────────────────────────────
// Extracts TASK, RATIONALE, DRAFT from the structured agent output.
// Replaces buildPersonalizedTodayDraft — the AI draft is used directly.
function parseAgentOutput(
  raw: string,
  fallbackAction: string,
  fallbackMessage: string,
): { action: string; rationale: string; draft: string } {
  // Support both labeled (TASK: ...) and unlabeled output (graceful degradation)
  const taskMatch = raw.match(/TASK:\s*([\s\S]+?)(?:\n|RATIONALE:|$)/);
  const rationaleMatch = raw.match(/RATIONALE:\s*([\s\S]+?)(?:\n|DRAFT:|$)/);
  const draftMatch = raw.match(/DRAFT:\s*([\s\S]+)$/);
  const action = taskMatch?.[1]?.trim() || fallbackAction;
  const rationale = rationaleMatch?.[1]?.trim() || "";
  // DRAFT may span multiple lines — trim but preserve line breaks within it
  const draft = draftMatch?.[1]?.trim() || fallbackMessage;

  return { action, rationale, draft };
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: string, data: unknown) {
        controller.enqueue(encoder.encode(sse(event, data)));
      }

      try {
        void loadActivePrompts();
        const routeUser = await getRouteUser();
        if (!routeUser) {
          emit("error", { message: "Unauthorized" });
          controller.close();
          return;
        }

        const body = await request.json().catch(() => ({}));
        const userId = String(body?.userId ?? routeUser.userId).trim();
        const projectId = String(body?.projectId ?? "").trim();
        const providedStage = String(body?.stage ?? "").trim().slice(0, 50);
        const acknowledgeDebt = Boolean(body?.acknowledgeDebt);

        if (userId !== routeUser.userId || !userId || !projectId) {
          emit("error", { message: "Invalid request" });
          controller.close();
          return;
        }

        // feature: "core" — see non-streaming today-action/route.ts for why
        // this gets its own usage bucket, separate from Coach/reflections.
        await enforceAndTrackAIUsage(userId, routeUser.plan, "core");

        let stage = providedStage || "Idea";
        let targetUsers = "";
        let problem = "";
        let title = "";
        let description = "";
        let projectContext = "";
        let lastReflectionContext = "";
        let debtContext = "";
        let founderArchetype: string | undefined;
        let knowledgeMatches: FounderKnowledgeMatch[] = [];
        let cognitionBlock = "";
        let cognitionMomentumScore = 50;
        let cognitionAvoidanceSignals: string[] = [];
        let cognitiveLoad: "fresh" | "drained" | "autopilot" = "fresh";
        let founderCountry: string | undefined;
        let lastReflectionNote: string | undefined;
        let adminForCache: ReturnType<typeof createAdminClient> | null = null;
        let founderIntelligence: FounderIntelligenceState | null = null;
        let founderIntelligencePromptBlock = "";
        let personalisationCtx = {
          recentActionsBlock: "",
          recentReflectionsBlock: "",
          recurringBlockers: [] as string[],
          activeGoals: [] as string[],
        };

        // ── Shared context loader (lib/todayActionContext.ts) ────────────────
        // Replaces the ~200-line duplicated data-loading block that previously
        // existed independently in both this file and today-action/route.ts.
        const tctx = await loadTodayActionContext({
          userId,
          projectId,
          providedStage,
          acknowledgeDebt,
          sessionId: `today_action_stream:${projectId || "none"}:${Date.now()}`,
        });

        if (tctx.debtSuppression.suppressed) {
          emit("done", {
            success: true,
            data: {
              debtSuppressed: true,
              debtCategory: tctx.debtSuppression.category,
              debtMessage: tctx.debtSuppression.message,
              interventionHint: tctx.debtSuppression.interventionHint,
              stage: tctx.stage,
            },
          });
          controller.close();
          return;
        }

        stage = tctx.stage;
        targetUsers = tctx.targetUsers;
        problem = tctx.problem;
        title = tctx.title;
        description = tctx.description;
        projectContext = tctx.projectContext;
        lastReflectionContext = tctx.lastReflectionContext;
        debtContext = tctx.debtContext;
        founderArchetype = tctx.founderArchetype;
        knowledgeMatches = tctx.knowledgeMatches;
        cognitionBlock = tctx.cognitionBlock;
        cognitionMomentumScore = tctx.cognitionMomentumScore;
        cognitionAvoidanceSignals = tctx.cognitionAvoidanceSignals;
        // See lib/todayActionContext.ts's mapEnergyToCognitiveLoad — the
        // stream route previously had no cognitive-load handling at all
        // (not even the buggy "low"/"normal"/"high" passthrough the
        // non-stream route had), so this is new here, not a bug fix.
        cognitiveLoad = tctx.cognitionCognitiveLoad ?? "fresh";
        founderCountry = tctx.founderCountry;
        lastReflectionNote = tctx.lastReflectionNote;
        adminForCache = tctx.adminClient;
        founderIntelligence = tctx.founderIntelligence;
        founderIntelligencePromptBlock = tctx.founderIntelligencePromptBlock;
        personalisationCtx = tctx.personalisationCtx;

        const fallback = buildFallback(stage, targetUsers, problem, title, description);

        emit("agent_a", { status: "running", label: "Agent A generating your task…" });

        const activeGoalsLine =
          personalisationCtx.activeGoals.length > 0
            ? `\nACTIVE GOALS (pick one to advance today):\n${personalisationCtx.activeGoals.map((g, i) => `${i + 1}. ${g}`).join("\n")}`
            : "";

        const blockersLine =
          personalisationCtx.recurringBlockers.length > 0
            ? `\nRECURRING BLOCKERS DETECTED:\n${personalisationCtx.recurringBlockers.map((b) => `- "${b}"`).join("\n")}\n-> Today's task must either directly address one of these blockers or explicitly route around it.`
            : "";

        // New here (see lib/todayActionContext.ts's mapEnergyToCognitiveLoad)
        // — the stream route previously had no cognitive-load handling at
        // all, not even a buggy passthrough.
        const cognitiveLoadLine =
          cognitiveLoad === "drained"
            ? `\nFOUNDER ENERGY TODAY: drained. Assign something smaller and more achievable than usual — a 15-20 minute win, not a stretch task.`
            : cognitiveLoad === "autopilot"
              ? `\nFOUNDER ENERGY TODAY: autopilot / low-focus. Prefer a task with a clear script or checklist over one requiring fresh judgment calls.`
              : "";

        // Same regional-context helper the non-stream route passes through
        // ReflexionContext.country — this route builds its prompt inline
        // rather than via runReflexionLoop(), so it's injected directly.
        const regionalContextLine = founderCountry ? `\n${formatRegionalContextBlock(founderCountry)}` : "";

        // ── PATCH 1: systemA — structured TASK/RATIONALE/DRAFT output ────────
        // Old prompt: "Return a single concrete task" → model returns one headline, stops.
        // New prompt: structured output with a real paste-ready draft using actual
        // product name and target user. Avoidance pattern named explicitly in RATIONALE.
        // Token limit raised from 300 to 600 to give space for DRAFT.
        const systemA = `You are BuildMind — a brutally honest execution coach for solo founders. You know this founder's behavioral patterns and avoidance zones.

${projectContext ? `FOUNDER DATA:\n${projectContext}` : ""}
${activeGoalsLine}
${personalisationCtx.recentReflectionsBlock}
${personalisationCtx.recentActionsBlock}
${blockersLine}
${cognitiveLoadLine}
${regionalContextLine}
${cognitionBlock ? `\n${cognitionBlock}` : ""}
${founderIntelligencePromptBlock ? `\n${founderIntelligencePromptBlock}` : ""}
${lastReflectionContext}
${debtContext}

Output EXACTLY this structure — no preamble, no extra text:

TASK: [One sentence. Specific number, exact platform, exact user type. Completable in under 1 hour. No generics like "some users" or "relevant communities".]
RATIONALE: [One sentence starting with "Because". Name the specific avoidance pattern, blocker, or reflection outcome this directly addresses.]
DRAFT: [A 2–3 sentence paste-ready message the founder can send TODAY. Use the actual product name (${title || "their product"}) and actual target user type (${targetUsers || "their users"}). No placeholder brackets like [Name], [Company], [Your Product]. Address the recipient's specific context.]

EXAMPLE OF BAD OUTPUT:
TASK: Message some users today about your product.
RATIONALE: Because you need validation.
DRAFT: Hi [Name], I wanted to reach out about my startup and get your thoughts.

EXAMPLE OF GOOD OUTPUT (if product is BuildMind, targeting solo founders):
TASK: Message 3 solo SaaS founders on LinkedIn today — ask if they track their daily execution pattern, not about BuildMind.
RATIONALE: Because you've avoided cold outreach for 4 days and every insight in your DB came from a conversation, not a dashboard.
DRAFT: Hi [Name], quick question — do you have any system for tracking whether you're actually following through on daily priorities, or does it just live in your head? Building something in this space and trying to understand how founders currently handle it.

HARD RULES:
1. TASK must NOT be semantically equivalent to any task in the RECENT ACTION HISTORY above.
2. DRAFT must use the actual product name and actual target user — never placeholder brackets.
3. If a blocker or avoidance zone is present, TASK or RATIONALE must name it explicitly.
4. DRAFT must not contain [Name], [Company], [Your Product], [Target Audience].`;

        let agentAOutput = "";
        try {
          agentAOutput = await groqCall(
            [{ role: "system", content: systemA }, { role: "user", content: "Give me today's single most important task." }],
            0.6, 1000  // Raised to 1000 — gives DRAFT enough room to complete
          );
        } catch {
          agentAOutput = `TASK: ${fallback.action}\nRATIONALE: Because you're at ${stage} stage and this is the highest-leverage move today.\nDRAFT: ${fallback.message}`;
        }
        agentAOutput = cleanVisibleText(agentAOutput, `TASK: ${fallback.action}\nRATIONALE: Because this is the highest-leverage move today.\nDRAFT: ${fallback.message}`);

        emit("agent_a", { status: "done", output: agentAOutput });

        // ── Agent B — Critic ──────────────────────────────────────────────
        const criticPersona = getWeeklyCriticPersona(undefined, userId);
        emit("agent_b", { status: "running", label: `Agent B (${criticPersona.name}) critiquing…` });

        let criticVerdict: "pass" | "fail" = "pass";
        let criticReason = "Looks good.";
        let improvedVersion: string | null = null;

        try {
          const parsed = await callModelJSON<{
            verdict?: string;
            reason?: string;
            improved_version?: string | null;
          }>(
            [
              {
                role: "system",
                content: `${criticPersona.prompt}

You are a GATEKEEPER. Reject the task if ANY of the following are true:
1. No specific platform (e.g. "social media" instead of "LinkedIn" or "WhatsApp")
2. No named user type from the founder's context
3. No number of people or actions
4. Semantically equivalent to any task in the RECENT TASKS list below
5. DRAFT contains placeholder text like "[Your Product]", "[Target Audience]", "[Name]", "[Company]"
6. The task does not advance any of the stated active goals (if goals were provided)
7. The DRAFT is not paste-ready (too generic, no specific context)
${founderIntelligence ? buildCriticJudgmentRule(buildCofounderJudgment(founderIntelligence)) : ""}

${personalisationCtx.recentActionsBlock}

JSON only: { "verdict": "pass"|"fail", "reason": "one sentence", "improved_version": "improved TASK line only if fail, else null" }
Context: Stage=${stage}, Target users=${targetUsers || "unknown"}, Product=${title || "unknown"}`,
              },
              { role: "user", content: `Evaluate:\n${agentAOutput}` },
            ],
            { role: "reasoning", temperature: 0.3, maxTokens: 300 },
          );
          criticVerdict = (parsed.verdict === "fail" ? "fail" : "pass") as "pass" | "fail";
          criticReason = parsed.reason ?? "OK";
          improvedVersion = parsed.improved_version ?? null;
          improvedVersion = improvedVersion ? sanitizeModelOutput(improvedVersion) : null;
        } catch {
          // critic failed — default to pass
        }

        emit("agent_b", {
          status: "done",
          verdict: criticVerdict,
          reason: criticReason,
          persona: criticPersona.name,
        });

        // ── Agent C — Refiner ─────────────────────────────────────────────
        emit("agent_c", { status: "running", label: "Agent C refining final version…" });

        const baseForC = criticVerdict === "fail" && improvedVersion
          ? `${agentAOutput}\n\n[CRITIC SUGGESTED IMPROVED TASK: ${improvedVersion}]`
          : agentAOutput;
        const refineMode = criticVerdict === "fail"
          ? "REBUILD: The original task was rejected. Rewrite the TASK line to be sharper and more specific. Keep RATIONALE and DRAFT if they are good, or rewrite them to match the new task."
          : "POLISH: Tighten wording only — do not change substance.";

        let refined = baseForC;

        try {
          // ── PATCH 2: Agent C preserves TASK/RATIONALE/DRAFT structure ────
          // Old prompt: "2-3 sentences max" — collapsed the structure.
          // New prompt: explicit instruction to output all three sections.
          // Token limit raised from 250 to 600.
          refined = await groqCall(
            [{
              role: "system",
              // ── PATCH 2 applied here ──────────────────────────────────────
              content: `BuildMind execution engine. ${refineMode}

CRITICAL: Output EXACTLY this structure, no preamble:

TASK: [refined task — specific number, exact platform, exact user type, completable in 30 min]
RATIONALE: [one sentence starting with "Because" — name the avoidance zone or blocker this addresses]
DRAFT: [2–3 sentence paste-ready message — use actual product name (${title || "their product"}) and actual target user (${targetUsers || "their users"}), no placeholder brackets]

Rules:
- Never use [Name], [Company], [Your Product], [Target Audience] in DRAFT
- TASK must name the exact platform and a specific number
- DRAFT must be something the founder can literally copy-paste right now

Stage: ${stage} | Target: ${targetUsers || "not set"} | Product: ${title || "not set"}
Critique: ${criticReason}

Input to refine:
${baseForC}`,
            }, { role: "user", content: "Refine the output." }],
            0.3, 1000  // Raised to 1000 — gives DRAFT enough room to complete
          );
        } catch {
          // refiner failed — use Agent A output as-is
        }
        refined = cleanVisibleText(refined, baseForC);

        emit("agent_c", { status: "done", output: refined });

        // ── PATCH 3: parseAgentOutput replaces buildPersonalizedTodayDraft ──
        // Old code: called buildPersonalizedTodayDraft which picked a hardcoded
        // template variant and ignored everything Agent A/C produced.
        // New code: extracts TASK, RATIONALE, DRAFT from the structured output
        // so the message field comes from the AI-written draft.
        const parsed = parseAgentOutput(
          refined || agentAOutput,
          fallback.action,
          fallback.message,
        );
        const deterministicCandidate = founderIntelligence?.decision.top_candidate ?? null;
        const finalAction = deterministicCandidate?.action ?? parsed.action;
        const decisionReason = deterministicCandidate?.why_it_beats_alternatives;

        // rationale — use from parsed output, fall back to a generic sentence
        const rationale = parsed.rationale ||
          cleanVisibleText(
            await groqCall(
              [{ role: "system", content: `One sentence (max 15 words) explaining WHY this is right for this founder NOW. Start with "Because".` },
               { role: "user", content: parsed.action }],
              0.2, 60
            ).catch(() => ""),
            `Because you're at ${stage} stage and this is the highest-leverage move today.`
          );

        const finalData = {
          ...fallback,
          action: finalAction,
          message: parsed.draft,  // ← AI-written DRAFT, not hardcoded template
          why: decisionReason ? `${rationale} ${decisionReason}` : rationale,
          stage,
          isAI: true,
          decisionBasis: deterministicCandidate ? {
            expected_evidence: deterministicCandidate.expected_evidence,
            why_it_beats_alternatives: deterministicCandidate.why_it_beats_alternatives,
            score: deterministicCandidate.scores.total,
            alternatives: founderIntelligence?.decision.candidates.slice(1, 4).map((c) => ({
              action: c.action,
              score: c.scores.total,
              why: c.why_it_beats_alternatives,
            })) ?? [],
          } : undefined,
          reflexion: {
            verdict: criticVerdict,
            criticPersona: criticPersona.name,
            rationale,
            loopRan: true,
            passedCritic: criticVerdict !== "fail",
            lastReflectionUsed: lastReflectionContext.includes("LAST REFLECTION"),
          },
          // Phase 10: layers the coherence-layer summary above the existing
          // Today experience without replacing it — "what changed / what
          // BuildMind detected / why it matters / predicted top action" for
          // any UI that wants to surface it (see lib/founderIntelligence.ts).
          intelligence: founderIntelligence ? summarizeFounderIntelligenceForClient(founderIntelligence) : undefined,
        };

        // Quality log (fire-and-forget)
        if (hasAdminEnv() && finalData.action) {
          recordActivity(userId, "task_accepted", { projectId, stage, action: finalData.action }).catch(() => {});
          const { version: promptVersion, variant } = getPromptForRequest("reflexion_generator", userId);
          void evaluateAIOutput({
            userId,
            projectId,
            context: "today_action_stream",
            promptId: "reflexion_generator",
            promptVersion,
            variant,
            output: finalData.action,
            originalOutput: criticReason,
            founderContext: {
              stage,
              targetUsers,
              archetype: founderArchetype,
              lastReflection: lastReflectionNote,
              avoidanceZones: cognitionAvoidanceSignals,
              momentumScore: cognitionMomentumScore,
            },
          });

          if (adminForCache) {
            const learningSessionId = `today_action:${projectId ?? "none"}:${Date.now()}`;
            const logRowId = await recordActionShown({
              userId,
              projectId: projectId ?? "",
              sessionId: learningSessionId,
              stage,
              actionShown: finalData.action,
              criticPersona: criticPersona.name,
              viabilityScore: undefined,
              confidence: undefined,
            }).catch((err) => {
              logError("today-action-stream/recordActionShown", err);
              return null;
            });
            if (logRowId) {
              (finalData as typeof finalData & { log_row_id?: string }).log_row_id = logRowId;
            }

            upsertTodayActionCache(adminForCache, userId, {
              date: new Date().toISOString().slice(0, 10), // UTC — matches task-complete today
              projectId,
              stage,
              data: { ...finalData, reflexion_status: "ok" },
              generatedAt: new Date().toISOString(),
              source: "today-action",
            }).catch((err) => logError("today-action-stream/cache", err, { route: "/api/ai/today-action/stream", userId }));
          }
        }

        emit("done", { success: true, data: finalData });
        controller.close();

      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream failed";
        try {
          controller.enqueue(encoder.encode(sse("error", { message: msg })));
        } catch {}
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
  }
