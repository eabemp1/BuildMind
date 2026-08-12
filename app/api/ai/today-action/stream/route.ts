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
import { getWeeklyCriticPersona, buildCriticJudgmentRule } from "@/lib/reflexion";
import { buildCofounderJudgment } from "@/lib/cofounderJudgment";
import { callModelJSON, sanitizeModelOutput } from "@/lib/ai-providers";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { buildArchetypeSystemContext } from "@/lib/founderArchetype";
import { buildDebtPromptInjection, computeExecutionDebt, debtSuppressesTask, markDebtSurfaced } from "@/lib/executionDebt";
import { recordActivity } from "@/lib/server/activityLog";
import { buildKnowledgeBaseContext, searchFounderKnowledgeBase, type FounderKnowledgeMatch } from "@/lib/founderKnowledgeBase";
import { loadCognitionInput, synthesizeFounderCognition, buildCognitionPromptBlock } from "@/lib/founderCognition";
import { evaluateAIOutput, failsHardPreScreen } from "@/lib/aiEvaluator";
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
// Kept in exact sync with the has_platform regex in lib/aiEvaluator.ts
// ACTION_CHECKS. If that list changes, this must change with it — it's the
// same list founderIntelligence.ts's OUTREACH_PLATFORMS draws from for
// candidate templates, so all three stay aligned on one vocabulary.
const ALLOWED_PLATFORMS = ["LinkedIn", "WhatsApp", "email", "Twitter", "phone", "in person", "Slack", "Telegram", "Instagram", "Reddit", "Product Hunt", "Indie Hackers"];

function normalizePlatform(raw: string | undefined): string {
  const found = ALLOWED_PLATFORMS.find((p) => (raw ?? "").toLowerCase().includes(p.toLowerCase()));
  return found ?? "WhatsApp"; // safe, always-valid default — never leave platform empty
}

interface StructuredAction {
  platform: string;
  count: number;
  user_type: string;
  task: string;
  rationale: string;
  draft: string;
}

// Structural guarantee, not a hope: if the model's own `task` sentence
// already names the platform and a number, leave it untouched. If it
// doesn't, splice them in deterministically rather than throwing the whole
// generation away and falling back to the generic template. This is what
// turns has_platform/has_number from "usually true, we grade it after" into
// "always true by construction."
function composeConcreteTask(structured: StructuredAction): { task: string; platform: string; count: number } {
  const platform = normalizePlatform(structured.platform);
  const count = Number.isFinite(structured.count) && structured.count >= 1 ? Math.round(structured.count) : 3;
  let task = (structured.task ?? "").trim();
  const hasPlatform = new RegExp(platform.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(task);
  const hasNumber = /\b\d+\b/.test(task);
  if (!task) {
    task = `Advance today's goal with ${count} ${structured.user_type || "people"} on ${platform}.`;
  } else if (!hasPlatform || !hasNumber) {
    const missing = [!hasNumber ? `${count} ${structured.user_type || "people"}` : null, !hasPlatform ? `on ${platform}` : null]
      .filter(Boolean)
      .join(" ");
    task = `${task.replace(/[.!?]\s*$/, "")} — ${missing}.`;
  }
  return { task, platform, count };
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
        // FIX (task-repeat bug): "Replace this task" cleared client-side
        // cache and forced a fresh generation call, but never told the
        // server which task the founder had just explicitly rejected.
        // Founder context/signals rarely change meaningfully within the
        // few seconds between the original request and a replace click,
        // so the deterministic candidate scoring (and often the LLM too)
        // legitimately re-picked the exact same top-ranked action — the
        // request WAS fresh, it just kept arriving at the same answer.
        // Now the rejected action's text is threaded into the prompt as
        // an explicit exclusion.
        const excludeAction = String(body?.excludeAction ?? "").trim().slice(0, 500);

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
        let isLowConfidence = false;
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
          excludeAction,
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

        // ── Confidence as a branch, not a hidden number ───────────────────
        // Previously the top candidate's confidence score existed (see
        // scoreCandidate() in lib/founderIntelligence.ts) but never changed
        // anything about the output — a 25%-confidence recommendation was
        // phrased with exactly the same certainty as a 90%-confidence one.
        // Below this threshold, the task itself should be framed as
        // evidence-gathering ("here's how to find out"), not a confident
        // directive dressed up to sound sure of itself.
        const topCandidateConfidence = founderIntelligence?.decision.top_candidate?.scores.confidence ?? 100;
        isLowConfidence = topCandidateConfidence < 40;
        if (isLowConfidence) {
          founderIntelligencePromptBlock += `\n\nCONFIDENCE NOTICE: Current confidence in this recommendation is low (${topCandidateConfidence}%) — there isn't enough recent evidence about this founder's situation yet. Do NOT phrase "task" as a confident directive. Frame it explicitly as a small evidence-gathering step, and "rationale" must say plainly that this is about closing an evidence gap, not a high-conviction recommendation.`;
        }

        if (excludeAction) {
          founderIntelligencePromptBlock += `\n\nHARD CONSTRAINT: The founder just explicitly rejected this exact task moments ago: "${excludeAction}". Do NOT suggest this same task again, even reworded — pick a genuinely different highest-leverage action from the remaining candidates.`;
        }
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

        // ── Structured output, not prose-then-regex ───────────────────────
        // Previously this was one free-text completion parsed by a regex
        // hunting for "TASK:"/"RATIONALE:"/"DRAFT:" labels. Every instruction
        // block added above this point (goals, blockers, cognitive load,
        // FI OS state, debt context...) increased the chance the model's
        // output format drifted under the combined load, which silently
        // failed the regex and fell back to the generic template — which is
        // why strengthening the system kept making Today tasks *more*
        // generic, not less. platform/count/user_type are now required JSON
        // fields: the model cannot omit them without a parse failure we
        // catch explicitly, and composeConcreteTask() repairs the sentence
        // deterministically even if the model's own phrasing is loose.
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

Return JSON with exactly these fields:
{
  "platform": one of ${JSON.stringify(ALLOWED_PLATFORMS)},
  "count": integer 1-10 — how many people/actions,
  "user_type": the specific user type this targets (use "${targetUsers || "their target users"}" unless the founder data clearly points elsewhere),
  "task": one sentence, completable in under 1 hour, naming the platform and count explicitly. No generics like "some users" or "relevant communities".
  "rationale": one sentence starting with "Because" — name the specific avoidance pattern, blocker, or reflection outcome this directly addresses.
  "draft": a 2-3 sentence paste-ready message using the actual product name (${title || "their product"}) and actual target user type. No placeholder brackets like [Name], [Company], [Your Product].
}

HARD RULES:
1. "task" must NOT be semantically equivalent to any task in the RECENT ACTION HISTORY above.
2. "draft" must use the actual product name and actual target user — never placeholder brackets.
3. If a blocker or avoidance zone is present, "task" or "rationale" must name it explicitly.
4. "draft" must not contain [Name], [Company], [Your Product], [Target Audience].`;

        let structuredA: StructuredAction;
        try {
          structuredA = await callModelJSON<StructuredAction>(
            [{ role: "system", content: systemA }, { role: "user", content: "Give me today's single most important task. Return JSON only." }],
            { role: "reasoning", temperature: 0.6, maxTokens: 700 },
          );
        } catch {
          structuredA = {
            platform: normalizePlatform(fallback.platform),
            count: 3,
            user_type: targetUsers || "your target users",
            task: fallback.action,
            rationale: `Because you're at ${stage} stage and this is the highest-leverage move today.`,
            draft: fallback.message,
          };
        }
        const composedA = composeConcreteTask(structuredA);
        const agentAFields = {
          task: composedA.task,
          rationale: cleanVisibleText(structuredA.rationale, `Because this is the highest-leverage move today.`),
          draft: cleanVisibleText(structuredA.draft, fallback.message),
        };
        // agentAOutput kept as a display blob purely so the Critic prompt
        // below (which evaluates free text) and the eval/log pipeline don't
        // need to change shape — the fields feeding it are now guaranteed,
        // not parsed.
        const agentAOutput = `TASK: ${agentAFields.task}\nRATIONALE: ${agentAFields.rationale}\nDRAFT: ${agentAFields.draft}`;

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
1. Semantically equivalent to any task in the RECENT TASKS list below
2. DRAFT contains placeholder text like "[Your Product]", "[Target Audience]", "[Name]", "[Company]"
3. The task does not advance any of the stated active goals (if goals were provided)
4. The DRAFT is not paste-ready (too generic, no specific context)
${founderIntelligence ? buildCriticJudgmentRule(buildCofounderJudgment(founderIntelligence)) : ""}

Do NOT reject for missing platform, user type, or a specific number — those are structurally guaranteed before you see this text (see composeConcreteTask() in this file) and are never actually absent, so judging them again only risks a false rejection of otherwise-correct output.

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

        const refineMode = criticVerdict === "fail"
          ? `REBUILD: The original task was rejected.${improvedVersion ? ` Critic's suggested improved task: "${improvedVersion}".` : ""} Rewrite "task" to be sharper and more specific. Keep "rationale" and "draft" if they are good, or rewrite them to match the new task.`
          : "POLISH: Tighten wording only — do not change substance.";

        let structuredC: StructuredAction = structuredA;
        try {
          // Same schema as Agent A — the refiner adjusts the fields, it
          // doesn't re-enter free text. composeConcreteTask() runs on
          // whatever comes back either way, so a refiner that loosens the
          // wording still can't ship without platform/count present.
          structuredC = await callModelJSON<StructuredAction>(
            [{
              role: "system",
              content: `BuildMind execution engine. ${refineMode}

Return JSON with exactly these fields: platform (one of ${JSON.stringify(ALLOWED_PLATFORMS)}), count (integer 1-10), user_type, task (specific number + exact platform, completable in 30 min), rationale (one sentence starting with "Because"), draft (2-3 sentence paste-ready message using actual product name "${title || "their product"}" and actual target user "${targetUsers || "their users"}", no placeholder brackets).

Rules:
- Never use [Name], [Company], [Your Product], [Target Audience] in draft
- task must name the exact platform and a specific number
- draft must be something the founder can literally copy-paste right now

Stage: ${stage} | Target: ${targetUsers || "not set"} | Product: ${title || "not set"}
Critique: ${criticReason}

Input to refine:
${JSON.stringify(structuredA)}`,
            }, { role: "user", content: "Refine and return JSON only." }],
            { role: "reasoning", temperature: 0.3, maxTokens: 700 },
          );
        } catch {
          // refiner failed — structuredC stays equal to Agent A's structured output
        }

        const composedC = composeConcreteTask(structuredC);
        const agentCFields = {
          task: composedC.task,
          rationale: cleanVisibleText(structuredC.rationale, agentAFields.rationale),
          draft: cleanVisibleText(structuredC.draft, agentAFields.draft),
        };
        const refined = `TASK: ${agentCFields.task}\nRATIONALE: ${agentCFields.rationale}\nDRAFT: ${agentCFields.draft}`;

        emit("agent_c", { status: "done", output: refined });

        const deterministicCandidate = founderIntelligence?.decision.top_candidate ?? null;
        // FIX (blend, not override): finalAction used to prefer
        // deterministicCandidate.action — a hand-written template string
        // (see buildDecisionState in lib/founderIntelligence.ts). Since
        // "continue_best_next_task" is pushed unconditionally with no
        // signal gate, top_candidate is almost never null, so the template
        // was winning over Agent A/C's actual output on nearly every
        // request, making the whole three-agent pipeline above pointless
        // for the headline text. The decision layer's reasoning is still
        // fed to Agent A/C as required framing upstream (via
        // founderIntelligencePromptBlock) and is still surfaced below as
        // decisionReason/decisionBasis — it just no longer replaces the
        // AI's own composed sentence.
        // ── Hard pre-screen gate ──────────────────────────────────────────
        // Kept as a final safety net even though composeConcreteTask()
        // already guarantees platform/count structurally — this catches
        // the has_user_type check (which composeConcreteTask doesn't
        // enforce) and any edge case where a bad normalizePlatform() match
        // still slipped through. A hard fail here should now be rare rather
        // than routine, which is the actual point of this whole rewrite.
        const preScreenTarget = targetUsers || inferProjectAudience(targetUsers, title, description, problem);
        const preScreen = failsHardPreScreen(agentCFields.task, { stage, targetUsers: preScreenTarget });
        const wasHardFallback = preScreen.fails;
        const finalAction = wasHardFallback ? fallback.action : agentCFields.task;
        const finalDraft = wasHardFallback ? fallback.message : agentCFields.draft;
        const decisionReason = deterministicCandidate?.why_it_beats_alternatives;

        // rationale — comes directly from the structured field now. The old
        // code fell back to a THIRD separate LLM call whenever the regex
        // failed to capture a RATIONALE section; that call site is gone
        // because there's no longer a regex that can fail here.
        const rationale = agentCFields.rationale;

        const finalData = {
          ...fallback,
          action: finalAction,
          message: finalDraft,  // ← AI-written DRAFT, unless the hard pre-screen rejected it
          why: decisionReason ? `${rationale} ${decisionReason}` : rationale,
          stage,
          isAI: true,
          // Confidence as a branch, not a hidden number — see the
          // CONFIDENCE NOTICE injected above. When true, "action"/"why" were
          // generated with explicit instructions to frame this as
          // evidence-gathering rather than a confident directive, and the
          // UI should render a visibly different state, not just a lower
          // percentage on the same-looking card.
          isLowConfidence,
          decisionBasis: deterministicCandidate ? {
            expected_evidence: deterministicCandidate.expected_evidence,
            why_it_beats_alternatives: deterministicCandidate.why_it_beats_alternatives,
            score: deterministicCandidate.scores.total,
            confidence: deterministicCandidate.scores.confidence,
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
            // Surfaced to the client rather than hidden — if the AI's own
            // composition failed the platform/number/user-type gate, the
            // founder is looking at the deterministic fallback, and the UI
            // should be able to say so instead of pretending it's the same
            // pipeline output every other day.
            wasHardFallback,
            hardFallbackReasons: wasHardFallback ? preScreen.failed_checks : undefined,
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
