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
import { truncateWords } from "@/lib/textTruncate";

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
import { buildFirstDaysBrief, countBlockEntries } from "@/lib/firstDaysBrief";
import { planTodayMission, parseRecentTasks, missionPromptBlock, assessTaskQuality, missionMeta, type Mission } from "@/lib/todayMission";
import { fallbackForKind } from "@/lib/todayFallbacks";
import { groundTargetUsers, groundingPromptBlock, wantsGrounding } from "@/lib/todayGrounding";

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
  if (problem?.trim()) return truncateWords(problem.trim(), 8).replace(/[.!?]+$/, "");
  const haystack = `${title} ${description}`.toLowerCase();
  if (/(consent|privacy|gdpr|compliance|audit)/.test(haystack)) return "verifiable consent tracking and audit logging";
  if (description?.trim()) return truncateWords(description.trim(), 8).replace(/[.!?]+$/, "");
  return title?.trim() ? `${title.trim()} and the workflow it improves` : "their current workflow";
}

// Simple deterministic string hash — no crypto needed, just needs to be
// stable and reasonably distributed for variant rotation.
// Naive singularizer — target user descriptions from onboarding are almost
// always simple plural nouns ("solo founders," "small business owners"),
// so stripping a trailing s/es handles the common case correctly. Doesn't
// handle irregular plurals, but leaving "one solo founders" ungrammatical
// (confirmed by testing) is strictly worse than an imperfect heuristic.
function singularize(phrase: string): string {
  const trimmed = phrase.trim();
  if (/ies$/i.test(trimmed)) return trimmed.replace(/ies$/i, "y");
  if (/(x|ch|sh|ss)es$/i.test(trimmed)) return trimmed.replace(/es$/i, "");
  if (/s$/i.test(trimmed) && !/ss$/i.test(trimmed)) return trimmed.replace(/s$/i, "");
  return trimmed;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  // Avalanche finalizer (Murmur3 fmix32) — the raw polynomial hash above
  // correlates strongly between near-identical inputs (e.g. dates one day
  // apart differ by one character), which produced a visible period-4
  // repeat in testing despite there being 4 variants to rotate through.
  // This breaks that correlation so sequential days don't cycle predictably.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

type FallbackVariant = (ctx: { userType: string; problemDesc: string; productName: string; stage: string }) => {
  action: string;
  platform: string;
  message: string;
  why: string;
  time: string;
};

/**
 * Tier-3 fallback bank — used when AI generation is unavailable or the
 * pre-screen gate rejects the AI's composition. Previously this was one
 * static message per STAGE (6 entries total), which is why a founder could
 * see byte-identical fallback text for days straight whenever AI was down:
 * there was nothing to rotate between. This is organized by FI OS
 * ARCHETYPE instead — reflecting what the decision layer actually
 * determined (evidence gap, stalled goal, avoidance pattern, or steady
 * execution), each with 4 genuinely different variants — different
 * platform, different framing, different ask — selected by a deterministic
 * rotation so consecutive days don't repeat. This doesn't require an LLM
 * call at all: it's the same "template-based generation" technique used
 * long before generative AI existed, applied to data the FI OS already
 * computes for free.
 */
const FALLBACK_BANK: Record<string, FallbackVariant[]> = {
  evidence_probe: [
    ({ userType, problemDesc }) => ({
      action: `Message 3 ${userType} today — no pitch, just ask about ${problemDesc}.`,
      platform: "WhatsApp",
      message: `Hi [Name], quick question — what's your biggest frustration with ${problemDesc}? Researching it, would love 10 minutes.`,
      why: `Every assumption about ${userType} is probably wrong until tested. Three real conversations beat a week of planning.`,
      time: "1 hour",
    }),
    ({ userType, problemDesc }) => ({
      action: `Send 5 personal DMs to ${userType} on LinkedIn — ask about their workflow, not your idea.`,
      platform: "LinkedIn",
      message: `Hi [Name], how do you currently handle ${problemDesc}? Not pitching anything — genuinely curious what you do today.`,
      why: `Ask about their life, not your idea — you get honest answers instead of polite ones.`,
      time: "1–2 hours",
    }),
    ({ userType, problemDesc }) => ({
      action: `Post one specific question about ${problemDesc} in a community where ${userType} gather — read the replies, don't defend your idea.`,
      platform: "Reddit or relevant Slack",
      message: `Curious how people handle ${problemDesc} today — what's your current approach, and what's annoying about it?`,
      why: `A public question surfaces more honest disagreement than a DM — you want the objections, not just agreement.`,
      time: "45 minutes",
    }),
    ({ userType, problemDesc }) => ({
      action: `Call one ${singularize(userType)} you already know — ask what they tried last time ${problemDesc} came up.`,
      platform: "Phone call",
      message: `Hey [Name], quick one — last time you dealt with ${problemDesc}, what did you actually do? Not selling anything, just trying to understand.`,
      why: `Past behavior is a better predictor than a stated opinion — ask what they did, not what they'd do.`,
      time: "30 minutes",
    }),
  ],
  unstall_goal: [
    ({ userType, problemDesc, productName }) => ({
      action: `Finish the smallest unfinished piece of your current goal today — ship it, don't polish it.`,
      platform: "Direct work — no outreach needed",
      message: `(No draft needed — this is a build task, not an outreach task.)`,
      why: `The goal has been aging without visible progress. One completed piece, however small, is worth more than another day of planning.`,
      time: "1–2 hours",
    }),
    ({ userType, problemDesc, productName }) => ({
      action: `Share ${productName}'s current state with 2 ${userType} and watch them use it — don't explain, just observe.`,
      platform: "Screen share or in person",
      message: `Hi [Name], I've got something rough built for ${problemDesc}. Could you try it for 10 minutes while I watch? I won't explain anything.`,
      why: `Their confusion is your roadmap — this converts a stalled goal into a concrete next fix.`,
      time: "45 minutes",
    }),
    ({ userType, problemDesc }) => ({
      action: `Write down the ONE thing blocking your current goal, then do that one thing — not the easier task next to it.`,
      platform: "Direct work — no outreach needed",
      message: `(No draft needed — this is a build task, not an outreach task.)`,
      why: `Goals stall when the real blocker gets avoided in favor of adjacent, easier work. Naming it first makes avoidance harder.`,
      time: "1 hour",
    }),
    ({ userType, productName }) => ({
      action: `Set a 45-minute timer and advance your current goal with zero context-switching — phone away, one tab open.`,
      platform: "Direct work — no outreach needed",
      message: `(No draft needed — this is a build task, not an outreach task.)`,
      why: `Momentum on a stalled goal often just needs one uninterrupted block, not a new plan.`,
      time: "45 minutes",
    }),
  ],
  avoidance_microdose: [
    ({ userType, problemDesc }) => ({
      action: `Spend 15 minutes on the thing you've been avoiding — send just 1 message on WhatsApp related to ${problemDesc}.`,
      platform: "WhatsApp",
      message: `Hi [Name], following up — wanted to ask about ${problemDesc} directly rather than keep putting it off.`,
      why: `A small, time-boxed version of the avoided task is easier to start than the full version — the goal today is starting, not finishing.`,
      time: "15 minutes",
    }),
    ({ userType, problemDesc }) => ({
      action: `Message 1 ${singularize(userType)} on LinkedIn about ${problemDesc} — just one, keep it small.`,
      platform: "LinkedIn",
      message: `Hi [Name], quick one — has ${problemDesc} come up for you? Would love your take.`,
      why: `Repeated avoidance compounds — one small exposure today breaks the pattern without requiring a big commitment.`,
      time: "15 minutes",
    }),
    ({ userType, problemDesc }) => ({
      action: `Draft (don't send yet) the message you've been avoiding about ${problemDesc} — get it written, decide on sending after.`,
      platform: "Draft only — no send required",
      message: `[Draft space — write the message you've been avoiding here, even if you don't send it today.]`,
      why: `Separating "write it" from "send it" lowers the bar enough to actually start.`,
      time: "20 minutes",
    }),
    ({ userType, problemDesc }) => ({
      action: `Comment on 1 thread about ${problemDesc} where ${userType} are already talking — lower stakes than starting your own.`,
      platform: "Reddit or community forum",
      message: `Following this thread — dealing with something similar around ${problemDesc}. Curious what's worked for others here.`,
      why: `Responding to an existing conversation is a smaller step than starting one — good re-entry point for an avoided category.`,
      time: "15 minutes",
    }),
  ],
  continue_best_next_task: [
    ({ userType, productName }) => ({
      action: `Complete your highest-priority open task today and name one observable result before calling it done.`,
      platform: "Direct work — no outreach needed",
      message: `(No draft needed — this is a build task, not an outreach task.)`,
      why: `When no single signal dominates, the highest-leverage move is finishing what's already in motion with a real result attached.`,
      time: "1–2 hours",
    }),
    ({ userType, productName }) => ({
      action: `Call one ${singularize(userType)} who stopped using ${productName} — ask why, don't defend.`,
      platform: "Phone call",
      message: `Hi [Name], noticed you stopped using ${productName}. No pitch — just want to understand what happened. 10 minutes?`,
      why: `One churned user teaches you more than 10 new signups — this keeps forward motion honest.`,
      time: "45 minutes",
    }),
    ({ userType, productName }) => ({
      action: `Send a direct pricing question to 3 active ${userType} — ask if they'd pay, not what they think is fair in the abstract.`,
      platform: "WhatsApp or Email",
      message: `Hi [Name], considering pricing for ${productName}. Would [price] feel fair for what it does? Being honest helps more than being nice.`,
      why: `Willingness-to-pay is a sharper signal than general feedback — worth checking even mid-execution.`,
      time: "30 minutes",
    }),
    ({ userType, productName }) => ({
      action: `Post one update about ${productName}'s progress where ${userType} gather — visibility compounds even without a big announcement.`,
      platform: "Twitter/X or LinkedIn",
      message: `Small update on ${productName}: [specific thing shipped/learned this week]. Building in public because it keeps me honest.`,
      why: `Consistent small visibility beats sporadic big launches — this is a low-effort way to keep that going.`,
      time: "20 minutes",
    }),
  ],
};

function buildFallback(
  stage: string,
  targetUsers: string,
  problem: string,
  title: string,
  description = "",
  archetype?: string | null,
  rotationSeed = "",
): TodayAction {
  const userType = inferProjectAudience(targetUsers, title, description, problem);
  const problemDesc = inferProjectProblem(problem, title, description);
  const productName = title?.trim() || "your product";

  // Stage-appropriate archetype default when FI OS hasn't determined one
  // yet (e.g. very first run for a new founder, or FI OS load failed).
  const resolvedArchetype = archetype && FALLBACK_BANK[archetype]
    ? archetype
    : stage === "Growth" || stage === "Revenue"
      ? "continue_best_next_task"
      : "evidence_probe";

  const variants = FALLBACK_BANK[resolvedArchetype];
  const index = hashString(rotationSeed || `${resolvedArchetype}:${stage}`) % variants.length;
  const chosen = variants[index]({ userType, problemDesc, productName, stage });

  return {
    action: chosen.action,
    platform: chosen.platform,
    target_user: userType,
    message: chosen.message,
    why: chosen.why,
    time: chosen.time,
  };
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
  kind?: string;
  platform?: string;
  count?: number;
  user_type?: string;
  task: string;
  rationale: string;
  draft?: string;
  done_when?: string;
  first_step?: string;
  minutes?: number;
}

// Structural guarantee, not a hope: if the model's own `task` sentence
// already names the platform and a number, leave it untouched. If it
// doesn't, splice them in deterministically rather than throwing the whole
// generation away and falling back to the generic template. This is what
// turns has_platform/has_number from "usually true, we grade it after" into
// "always true by construction."
function composeConcreteTask(structured: StructuredAction, mission?: Mission): { task: string; platform: string; count: number } {
  // Only outreach-shaped missions need platform/number spliced in. A build,
  // analyze or pricing task is left exactly as written.
  if (mission && !mission.requires.platform && !mission.requires.number) {
    return { task: (structured.task ?? "").trim(), platform: "", count: 0 };
  }
  const platform = normalizePlatform(structured.platform);
  const count = Number.isFinite(structured.count) && (structured.count as number) >= 1 ? Math.round(structured.count as number) : 3;
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
  // FIX (Sept 22, 2026 — confirmed in production logs: stream timed out at
  // 30s with "all models failed except Groq's qwen" — meaning qwen was
  // likely still in flight, or had just succeeded, when Vercel killed the
  // function). This route makes THREE sequential callModel/callModelJSON
  // calls (Agent A, Critic, Refiner), and each one previously got its own
  // fresh internal budget — three independently-budgeted stages can still
  // sum past what's actually left in the 30s function window even if no
  // single stage looks slow on its own. One deadline, computed once here
  // and threaded through all three calls below, means stage 2 knows how
  // much stage 1 actually used instead of assuming an allowance it may not
  // have. 24s leaves ~6s of margin for request parsing, SSE setup, and
  // response writing outside the AI calls themselves.
  const requestDeadline = Date.now() + 21000;

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
        const sessionId = `today_action_stream:${projectId || "none"}:${Date.now()}`;
        const tctx = await loadTodayActionContext({
          userId,
          projectId,
          providedStage,
          acknowledgeDebt,
          sessionId,
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
        const topScores = founderIntelligence?.decision.top_candidate?.scores;
        const topCandidateConfidence = Math.min(
          topScores?.confidence ?? 100,
          (topScores?.predicted_success_n ?? 0) >= 2 ? (topScores?.predicted_success ?? 100) : 100,
        );
        isLowConfidence = topCandidateConfidence < 40;
        if (isLowConfidence) {
          founderIntelligencePromptBlock += `\n\nCONFIDENCE NOTICE: Current confidence in this recommendation is low (${topCandidateConfidence}%) — there isn't enough recent evidence about this founder's situation yet. Do NOT phrase "task" as a confident directive. Frame it explicitly as a small evidence-gathering step, and "rationale" must say plainly that this is about closing an evidence gap, not a high-conviction recommendation.`;
        }

        if (excludeAction) {
          founderIntelligencePromptBlock += `\n\nHARD CONSTRAINT: The founder just explicitly rejected this exact task moments ago: "${excludeAction}". Do NOT suggest this same task again, even reworded — pick a genuinely different highest-leverage action from the remaining candidates.`;
        }
        personalisationCtx = tctx.personalisationCtx;

        const fallback = buildFallback(
          stage, targetUsers, problem, title, description,
          founderIntelligence?.decision.top_candidate?.id,
          `${userId}:${new Date().toISOString().slice(0, 10)}`,
        );

        // ── Mission planning (lib/todayMission.ts) ────────────────────────
        const recentTasks = parseRecentTasks(personalisationCtx.recentActionsBlock);
        const mission = planTodayMission({
          stage,
          recentTasks,
          avoidance: cognitionAvoidanceSignals,
          blockers: personalisationCtx.recurringBlockers,
          activeGoals: personalisationCtx.activeGoals,
          cognitiveLoad,
          momentum: cognitionMomentumScore,
          isLowConfidence,
          candidateId: founderIntelligence?.decision.top_candidate?.id ?? null,
          excludeAction,
        });
        const grounding = wantsGrounding(mission.kind)
          ? await groundTargetUsers({ key: projectId, targetUsers, problem })
          : [];
        const groundingBlock = groundingPromptBlock(grounding);
        const missionBlock = missionPromptBlock(mission, { targetUsers, avoidance: cognitionAvoidanceSignals, blockers: personalisationCtx.recurringBlockers });
        const kindFallback = fallbackForKind(
          mission.kind,
          { userType: inferProjectAudience(targetUsers, title, description, problem), problemDesc: inferProjectProblem(problem, title, description), productName: title?.trim() || "your product", stage },
          `${userId}:${new Date().toISOString().slice(0, 10)}`,
        );
        const qualityCtx = {
          title, targetUsers, problem,
          blockers: personalisationCtx.recurringBlockers,
          avoidance: cognitionAvoidanceSignals,
          activeGoals: personalisationCtx.activeGoals,
          recentTasks,
        };
        emit("mission", { kind: mission.kind, label: mission.label, minutes: mission.minutes, reasons: mission.reasons, grounded: grounding.length });

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
        const firstDaysBrief = buildFirstDaysBrief({
          actionsShown: countBlockEntries(personalisationCtx.recentActionsBlock),
          reflections: countBlockEntries(personalisationCtx.recentReflectionsBlock),
          stage, title, problem, targetUsers,
        });

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
${firstDaysBrief ? `\n${firstDaysBrief}\n` : ""}
${missionBlock}
${groundingBlock}
Return JSON with exactly these fields:
{
  "kind": "${mission.kind}",
  "task": one sentence naming the exact thing to do, in this founder's own product/user terms. Completable in ${mission.minutes} minutes or less. No generics like "some users", "relevant communities", "research", "explore", "brainstorm".${mission.requires.platform ? ` Must name one of ${JSON.stringify(ALLOWED_PLATFORMS)}.` : ""}${mission.requires.number ? " Must include a specific number." : ""}
  "first_step": the literal first action to take in the next 2 minutes (open X, write Y),
  "done_when": one sentence a stranger could check ("3 messages sent", "page live at a URL", "decision written in 3 lines"),
  "minutes": integer ${Math.min(10, mission.minutes)}-${mission.minutes},
  "rationale": one sentence starting with "Because" - name the specific avoidance pattern, blocker, outcome or evidence gap this addresses,${mission.requires.platform ? `
  "platform": one of ${JSON.stringify(ALLOWED_PLATFORMS)},` : ""}${mission.requires.number ? `
  "count": integer 1-10,` : ""}${mission.requires.userType ? `
  "user_type": the specific user type (use "${targetUsers || "their target users"}" unless the data points elsewhere),` : ""}${mission.requires.draft ? `
  "draft": a 2-3 sentence paste-ready message using the actual product name (${title || "their product"}) and the actual target user. No placeholder brackets.` : `
  "draft": ""`}
}

HARD RULES:
1. "task" must NOT be semantically equivalent to any task in the RECENT ACTION HISTORY above.
2. Stay inside today's mission kind (${mission.label}); do not turn it into outreach unless the kind is outreach/interview/follow_up/publish.
3. If a blocker or avoidance zone is present, "task" or "rationale" must name it explicitly.
4. No placeholder brackets like [Name], [Company], [Your Product] anywhere.
5. Only name product features, integrations, customers, users, prices or results that appear in FOUNDER DATA, the reflection history or the signals above. Never invent a feature the founder "built", a customer, or something users "asked for". Items under RECENT TASKS are things that were SUGGESTED, not facts: a feature that only appears there may not exist. If the task needs a fact you do not have, make "first_step" the check that confirms it.
6. If the latest reflection says the founder could not do or find something, today's task must remove that obstacle or take a different route to the same goal. Do not hand back the step that just failed.`;

        let structuredA: StructuredAction;
        try {
          structuredA = await callModelJSON<StructuredAction>(
            [{ role: "system", content: systemA }, { role: "user", content: "Give me today's single most important task. Return JSON only." }],
            { role: "reasoning", temperature: 0.6, maxTokens: 700, deadlineMs: requestDeadline },
          );
        } catch (err) {
          logError("today-action-stream/agentA", err, { userId, stage, provider: "callModelJSON" });
          structuredA = {
            kind: mission.kind,
            platform: kindFallback.platform || undefined,
            count: 3,
            user_type: targetUsers || "your target users",
            task: kindFallback.action,
            rationale: `Because you're at ${stage} stage and this is the highest-leverage move today.`,
            draft: kindFallback.message,
            done_when: kindFallback.done_when,
            first_step: kindFallback.first_step,
            minutes: mission.minutes,
          };
        }
        const composedA = composeConcreteTask(structuredA, mission);
        const agentAFields = {
          task: composedA.task,
          rationale: cleanVisibleText(structuredA.rationale, `Because this is the highest-leverage move today.`),
          draft: mission.requires.draft ? cleanVisibleText(structuredA.draft, kindFallback.message) : "",
          done_when: cleanVisibleText(structuredA.done_when, ""),
          first_step: cleanVisibleText(structuredA.first_step, ""),
          minutes: Math.max(5, Math.min(90, Math.round(Number(structuredA.minutes) || mission.minutes))),
        };
        const qualityA = assessTaskQuality({ ...agentAFields, platform: structuredA.platform, count: structuredA.count }, mission, qualityCtx);
        // agentAOutput kept as a display blob purely so the Critic prompt
        // below (which evaluates free text) and the eval/log pipeline don't
        // need to change shape — the fields feeding it are now guaranteed,
        // not parsed.
        const agentAOutput = `TASK: ${agentAFields.task}\nFIRST STEP: ${agentAFields.first_step}\nDONE WHEN: ${agentAFields.done_when}\nRATIONALE: ${agentAFields.rationale}${agentAFields.draft ? `\nDRAFT: ${agentAFields.draft}` : ""}`;

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
2. Any field contains placeholder text like "[Your Product]", "[Target Audience]", "[Name]", "[Company]"
3. The task does not advance any of the stated active goals (if goals were provided)
4. ${mission.requires.draft ? "The DRAFT is not paste-ready (too generic, no specific context)" : "The task is vague about what exactly gets made, sent or decided"}
5. The task is not a ${mission.label} task (today's mission), or has no checkable "done when"
6. The task names a product feature, customer, user request or result that does not appear in the founder data above (a feature that only appears in RECENT TASKS was merely suggested, not built)
${founderIntelligence ? buildCriticJudgmentRule(buildCofounderJudgment(founderIntelligence)) : ""}

Do NOT reject for lacking a platform, user type or number unless the mission kind needs them; build, analyze, pricing, unblock and reset tasks legitimately have none.

${personalisationCtx.recentActionsBlock}

JSON only: { "verdict": "pass"|"fail", "reason": "one sentence", "improved_version": "improved TASK line only if fail, else null" }
Context: Stage=${stage}, Target users=${targetUsers || "unknown"}, Product=${title || "unknown"}`,
              },
              { role: "user", content: `Evaluate:\n${agentAOutput}` },
            ],
            { role: "reasoning", temperature: 0.3, maxTokens: 300, deadlineMs: requestDeadline },
          );
          criticVerdict = (parsed.verdict === "fail" ? "fail" : "pass") as "pass" | "fail";
          criticReason = parsed.reason ?? "OK";
          if (!qualityA.pass) {
            criticVerdict = "fail";
            criticReason = `${qualityA.reasons.join(" ")} ${criticReason}`.trim();
          }
          improvedVersion = parsed.improved_version ?? null;
          improvedVersion = improvedVersion ? sanitizeModelOutput(improvedVersion) : null;
        } catch (err) {
          logError("today-action-stream/agentB-critic", err, { userId, stage, provider: "callModelJSON" });
          // critic failed — fall back to the deterministic rubric alone
          if (!qualityA.pass) { criticVerdict = "fail"; criticReason = qualityA.reasons.join(" "); }
        }

        emit("agent_b", {
          status: "done",
          verdict: criticVerdict,
          reason: criticReason,
          persona: criticPersona.name,
        });

        // ── Agent C — Refiner (REBUILD only — skipped on a clean pass) ─────
        // Previously ran unconditionally, even in POLISH mode when the
        // Critic already approved Agent A's output — a full third LLM call
        // spent tightening wording on something already deemed good. Under
        // real provider-cost/rate-limit constraints, that's not a
        // sustainable default: only a genuine REBUILD (Critic said fail)
        // justifies spending the extra call. This is a straight ~33% cut
        // in LLM calls per generation on the common (pass) path.
        let structuredC: StructuredAction = structuredA;
        if (criticVerdict === "fail") {
          emit("agent_c", { status: "running", label: "Agent C rebuilding after critic rejection…" });
          const refineMode = `REBUILD: The original task was rejected.${improvedVersion ? ` Critic's suggested improved task: "${improvedVersion}".` : ""} Rewrite "task" to be sharper and more specific. Keep "rationale" and "draft" if they are good, or rewrite them to match the new task.`;
          try {
            // Same schema as Agent A — the refiner adjusts the fields, it
            // doesn't re-enter free text. composeConcreteTask() runs on
            // whatever comes back either way, so a refiner that loosens the
            // wording still can't ship without platform/count present.
            structuredC = await callModelJSON<StructuredAction>(
              [{
                role: "system",
                content: `BuildMind execution engine. ${refineMode}

Return JSON with exactly these fields: kind ("${mission.kind}"), task (one sentence, ${mission.label} work, at most ${mission.minutes} minutes${mission.requires.platform ? ", names one platform" : ""}${mission.requires.number ? ", has a specific number" : ""}), first_step, done_when, minutes (integer), rationale (one sentence starting with "Because")${mission.requires.platform ? ", platform" : ""}${mission.requires.number ? ", count" : ""}${mission.requires.userType ? ", user_type" : ""}, draft (${mission.requires.draft ? `2-3 sentence paste-ready message using actual product name "${title || "their product"}" and target user "${targetUsers || "their users"}"` : "empty string"}).

Rules:
- Never use bracket placeholders like [Name] or [Company]
- Fix every problem in the critique below
- Do not repeat anything in the recent task list

Mission: ${mission.label} - ${mission.reasons.join(" ")}
Stage: ${stage} | Target: ${targetUsers || "not set"} | Product: ${title || "not set"}
Critique: ${criticReason}

Input to refine:
${JSON.stringify(structuredA)}`,
              }, { role: "user", content: "Refine and return JSON only." }],
              { role: "reasoning", temperature: 0.3, maxTokens: 700, deadlineMs: requestDeadline },
            );
          } catch (err) {
            logError("today-action-stream/agentC-refiner", err, { userId, stage, provider: "callModelJSON" });
            // refiner failed — structuredC stays equal to Agent A's structured output
          }
        } else {
          emit("agent_c", { status: "done", output: "skipped — critic passed, no rebuild needed" });
        }

        const composedC = composeConcreteTask(structuredC, mission);
        const agentCFields = {
          task: composedC.task,
          rationale: cleanVisibleText(structuredC.rationale, agentAFields.rationale),
          draft: mission.requires.draft ? cleanVisibleText(structuredC.draft, agentAFields.draft) : "",
          done_when: cleanVisibleText(structuredC.done_when, agentAFields.done_when),
          first_step: cleanVisibleText(structuredC.first_step, agentAFields.first_step),
          minutes: Math.max(5, Math.min(90, Math.round(Number(structuredC.minutes) || agentAFields.minutes))),
        };
        const finalQuality = assessTaskQuality({ ...agentCFields, platform: structuredC.platform, count: structuredC.count }, mission, qualityCtx);
        const refined = `TASK: ${agentCFields.task}\nDONE WHEN: ${agentCFields.done_when}\nRATIONALE: ${agentCFields.rationale}${agentCFields.draft ? `\nDRAFT: ${agentCFields.draft}` : ""}`;

        if (criticVerdict === "fail") {
          emit("agent_c", { status: "done", output: refined });
        }

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
        // Kind-aware gate: the rubric (lib/todayMission.ts) only demands a
        // platform/number/user type when the mission kind needs them.
        const preScreen = { fails: !finalQuality.pass, failed_checks: finalQuality.hardFails.length ? finalQuality.hardFails : finalQuality.softFails };
        const wasHardFallback = preScreen.fails;
        const finalAction = wasHardFallback ? kindFallback.action : agentCFields.task;
        const finalDraft = wasHardFallback ? kindFallback.message : agentCFields.draft;
        const finalDoneWhen = wasHardFallback ? kindFallback.done_when : agentCFields.done_when;
        const finalFirstStep = wasHardFallback ? kindFallback.first_step : agentCFields.first_step;
        const finalMinutes = wasHardFallback ? Number.parseInt(kindFallback.time, 10) || mission.minutes : agentCFields.minutes;
        const decisionReason = deterministicCandidate?.why_it_beats_alternatives;

        // Historical tracking: previously wasHardFallback only existed in
        // the live response and today's single (overwritten-daily) cache
        // row — no way to see whether generation has been silently
        // degrading to the fallback template repeatedly over time. Awaited and keyed by the row id. The previous fire-and-forget update
        // matched on session_id and, in a serverless runtime, could be cut off
        // when the SSE stream closed: was_hard_fallback was NULL on all 100
        // production rows, so fallback frequency could not be measured at all.
        if (adminForCache && tctx.recommendationId) {
          try {
            await adminForCache
              .from("reflexion_learning_log")
              .update({
                was_hard_fallback: wasHardFallback,
                was_hard_fallback_reasons: wasHardFallback ? preScreen.failed_checks : null,
              })
              .eq("id", tctx.recommendationId)
              .eq("user_id", userId);
          } catch (err) {
            logError("today-action-stream/hardFallbackLog", err, { userId });
          }
        }

        // rationale — comes directly from the structured field now. The old
        // code fell back to a THIRD separate LLM call whenever the regex
        // failed to capture a RATIONALE section; that call site is gone
        // because there's no longer a regex that can fail here.
        const rationale = agentCFields.rationale;

        const finalData = {
          ...fallback,
          action: finalAction,
          time: `${finalMinutes} min`,
          platform: wasHardFallback ? kindFallback.platform : (composedC.platform || fallback.platform),
          missionKind: mission.kind,
          missionLabel: mission.label,
          missionReasons: mission.reasons,
          doneWhen: finalDoneWhen,
          firstStep: finalFirstStep,
          hasDraft: Boolean(finalDraft),
          qualityScore: wasHardFallback ? undefined : finalQuality.score,
          groundedIn: grounding.map((g) => ({ title: g.title, url: g.url })),
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
          intelligence: tctx.intelligenceSummary,
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
