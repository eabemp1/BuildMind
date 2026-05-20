import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceAndTrackAIUsage, groqJSON, groqReasoningJSON, hasAdminEnv, logReflexionQuality } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { logError } from "@/lib/server/logger";

export const runtime    = "nodejs";
export const dynamic    = "force-dynamic";
export const maxDuration = 60; // agent pipeline + reflexion chain can take up to ~45 s

import {
  runAgentPipeline,
  generatePivots,
  parseStartupIdea,
  type StartupContext,
  type ScrapedCompetitor,
} from "@/lib/agents";
import {
  computeViabilityScore,
  computeViabilityBreakdown,
  computeIterationDelta,
  type IterationRecord,
} from "@/lib/scoring";
import {
  runFullReflexionPipeline,
  type ReflexionContext,
} from "@/lib/reflexion";
import {
  getLearnedPatterns,
  buildLearnedPatternsPrompt,
  recordActionShown,
  markIgnoredAfter24h,
} from "@/lib/learning";

type ReflexionStatus = "ok" | "partial" | "failed";

// ─── Competitor scraper — DDG with fallback chain ────────────────────────────
//
// FIX: DDG blocks the request or changes HTML structure → empty competitor data
// silently poisoned the 5-agent pipeline. Now has three layers of defence:
//   1. DDG lite (primary) — fast, no API key required
//   2. Brave Search open endpoint (secondary) — different source, different IP block risk
//   3. AI-synthesised fallback (tertiary) — if both scrapers fail, the agent
//      generates plausible competitor context from the idea text itself so the
//      pipeline never runs with genuinely null competitor data.
//
// The caller always gets { results, scraped } — scraped: false signals to the
// UI that competitor data is inferred, not scraped, so it can show a caveat.

type ScrapeResult = { results: ScrapedCompetitor[]; scraped: boolean; source?: string };

/** Parse DDG lite HTML into ScrapedCompetitor array */
function parseDDGHtml(html: string): ScrapedCompetitor[] {
  const linkMatches = [...html.matchAll(/class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const snippetMatches = [...html.matchAll(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi)];
  const results: ScrapedCompetitor[] = [];
  for (let i = 0; i < Math.min(linkMatches.length, 6); i++) {
    const href = linkMatches[i]?.[1] ?? "";
    const rawTitle = (linkMatches[i]?.[2] ?? "").replace(/<[^>]+>/g, "").trim();
    const rawSnippet = (snippetMatches[i]?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
    let url = href;
    if (href.includes("uddg=")) {
      const match = href.match(/uddg=([^&]+)/);
      if (match?.[1]) url = decodeURIComponent(match[1]);
    }
    if (!url.startsWith("http") || !rawTitle) continue;
    results.push({ title: rawTitle, url, snippet: rawSnippet });
  }
  return results;
}

/** Primary scraper — DuckDuckGo lite */
async function scrapeDDG(query: string): Promise<ScrapeResult> {
  const encoded = encodeURIComponent(query);
  const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encoded}`, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { results: [], scraped: false };
  const html = await res.text();
  // Detect DDG HTML structure change — if neither pattern matches, treat as blocked
  if (!html.includes("result-link") && !html.includes("uddg=")) {
    return { results: [], scraped: false };
  }
  const results = parseDDGHtml(html);
  return { results, scraped: results.length > 0, source: "ddg" };
}

/** Secondary scraper — Brave Search open endpoint (no API key on public tier) */
async function scrapeBrave(query: string): Promise<ScrapeResult> {
  const encoded = encodeURIComponent(query);
  const res = await fetch(`https://search.brave.com/search?q=${encoded}&source=web`, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { results: [], scraped: false };
  const html = await res.text();
  // Brave uses data-url and class fz-15 title pattern
  const titleMatches = [...html.matchAll(/class="[^"]*title[^"]*"[^>]*>([^<]{3,80})<\/span/gi)];
  const urlMatches   = [...html.matchAll(/data-url="(https?:[^"]+)"/gi)];
  const results: ScrapedCompetitor[] = [];
  for (let i = 0; i < Math.min(Math.min(titleMatches.length, urlMatches.length), 6); i++) {
    const rawTitle = (titleMatches[i]?.[1] ?? "").trim();
    const url = (urlMatches[i]?.[1] ?? "").trim();
    if (!url.startsWith("http") || !rawTitle) continue;
    results.push({ title: rawTitle, url, snippet: "" });
  }
  return { results, scraped: results.length > 0, source: "brave" };
}

/** Tertiary fallback — AI synthesises plausible competitor context from idea text */
async function aiSynthesiseCompetitors(query: string): Promise<ScrapeResult> {
  const { callModelJSON, hasAIProvider } = await import("@/lib/ai-providers");
  if (!hasAIProvider()) return { results: [], scraped: false };
  try {
    interface AISynthResult {
      competitors?: Array<{ name: string; url: string; description: string }>;
    }
    const result = await callModelJSON<AISynthResult>(
      [{
        role: "system",
        content: `You are a market research assistant. Given a startup description, name up to 4 real known competitors or similar tools. Return ONLY valid JSON: { "competitors": [{ "name": string, "url": string, "description": string }] }`
      }, {
        role: "user",
        content: `Startup: ${query.slice(0, 300)}

List real direct or indirect competitors.`
      }],
      { role: "fast", maxTokens: 400 },
    );
    const comps = result?.competitors ?? [];
    const results: ScrapedCompetitor[] = comps
      .filter((c) => c.name && c.url)
      .map((c) => ({ title: c.name, url: c.url, snippet: c.description ?? "" }));
    // scraped: false signals to UI that this is AI-inferred, not scraped
    return { results, scraped: false, source: "ai_synthesised" };
  } catch {
    return { results: [], scraped: false };
  }
}

/**
 * scrapeCompetitors — three-layer fallback chain.
 * DDG → Brave → AI synthesis. Never returns null competitor data.
 * source field tells the caller where the data came from.
 */
async function scrapeCompetitors(query: string): Promise<ScrapeResult> {
  // Layer 1 — DDG lite
  try {
    const ddg = await scrapeDDG(query);
    if (ddg.results.length > 0) return ddg;
  } catch { /* fall through */ }

  // Layer 2 — Brave Search
  try {
    const brave = await scrapeBrave(query);
    if (brave.results.length > 0) return brave;
  } catch { /* fall through */ }

  // Layer 3 — AI synthesis (never blocks; scraped: false signals inferred data)
  return aiSynthesiseCompetitors(query);
}

// ─── Signal score (preserved — used for free tier preview) ───────────────────

function signalScore(
  taskRate: number,
  milestoneRate: number,
  strengths: string[],
  weaknesses: string[],
  execScore: number,
  valScore: number,
  stage = "Idea",
): number {
  const stageBonus: Record<string, number> = {
    Idea: 0, Validation: 5, MVP: 8, Launch: 12, Growth: 15, Revenue: 18,
  };
  const bonus = stageBonus[stage] ?? 0;

  const raw =
    taskRate * 0.30 +
    milestoneRate * 0.25 +
    Math.min(strengths.length * 5, 20) * 0.20 +
    Math.max(0, 10 - weaknesses.length * 2) * 0.10 +
    execScore * 0.10 +
    valScore * 0.05;

  return Math.min(97, Math.max(3, Math.round(raw + bonus)));
}

function previewSignalScore(idea: string, focusAreas: string[], stage = "Idea"): number {
  const words = idea.split(/\s+/).filter(Boolean).length;
  const hasUser = /\b(for|helps|founders|teams|students|businesses|users|customers|creators|developers)\b/i.test(idea);
  const hasProblem = /\b(problem|struggle|pain|waste|slow|expensive|hard|difficult|manual|risk)\b/i.test(idea);
  const hasBusiness = /\b(pay|paid|revenue|subscription|pricing|sell|customer|market)\b/i.test(idea);
  const stageBonus: Record<string, number> = { Idea: 0, Validation: 5, MVP: 9, Launch: 13, Growth: 16, Revenue: 20 };

  const raw =
    18 +
    Math.min(18, words * 0.45) +
    (hasUser ? 12 : 0) +
    (hasProblem ? 12 : 0) +
    (hasBusiness ? 10 : 0) +
    Math.min(8, focusAreas.length * 2) +
    (stageBonus[stage] ?? 0);

  return Math.min(82, Math.max(12, Math.round(raw)));
}

// ─── Execution Mode: MVP roadmap builder ─────────────────────────────────────

interface ExecutionPlan {
  mvp_roadmap: string[];        // 5-step MVP build sequence
  first_10_actions: string[];   // specific daily actions
  gtm_plan: string[];           // go-to-market steps
}

async function generateExecutionPlan(
  ctx: StartupContext,
  viabilityScore: number,
): Promise<ExecutionPlan> {
  const fallback: ExecutionPlan = {
    mvp_roadmap: [
      "Define the single core feature that solves the primary pain point",
      "Build a no-code or low-code prototype in 48 hours",
      "Test prototype with 3 target users — record every confusion point",
      "Iterate based on feedback — fix the top 3 confusions only",
      "Launch to a small closed beta of 10 users",
    ],
    first_10_actions: [
      "Write down the problem in one sentence — test it on 3 people today",
      "Find 5 potential users on LinkedIn or WhatsApp and message them",
      "Set up a simple landing page describing the problem and solution",
      "Create a private WhatsApp or Telegram group for beta users",
      "Build a wireframe or mockup using Figma or pen and paper",
      "Write one social post describing the problem — see who responds",
      "Research the top 3 competitors and list their biggest complaints on Twitter/Reddit",
      "Define your pricing model — pick one: monthly subscription or per-use",
      "Set a 30-day launch deadline and work backwards to today",
      "Complete your first user interview — ask about their current workaround",
    ],
    gtm_plan: [
      "Target the smallest possible niche first — ignore everyone else for 60 days",
      "Distribute where your users already gather (WhatsApp groups, LinkedIn, Slack)",
      "Offer first 10 users free access in exchange for weekly feedback",
      "Build in public — share progress updates to attract early adopters",
      "Set one activation metric that proves value (first result achieved)",
    ],
  };

  try {
    const result = await groqReasoningJSON<ExecutionPlan>(
      `You are a startup execution strategist. Return JSON with exactly these keys:
{
  "mvp_roadmap": ["step 1", "step 2", "step 3", "step 4", "step 5"],
  "first_10_actions": ["action 1", ..., "action 10"],
  "gtm_plan": ["step 1", "step 2", "step 3", "step 4", "step 5"]
}
Each item: specific, actionable, tied to THIS startup. No generic advice.
mvp_roadmap: 5 steps to build the MVP. first_10_actions: the next 10 concrete daily tasks.
gtm_plan: 5 go-to-market steps specific to this problem and user.`,
      `Startup: ${ctx.idea}
Problem: ${ctx.problem}
Target users: ${ctx.targetUsers}
Stage: ${ctx.stage}
Viability score: ${viabilityScore}/100
Build an execution plan that is specific to this startup. Name exact platforms, user types, and timelines.`,
    );
    return {
      mvp_roadmap: Array.isArray(result?.mvp_roadmap) && result.mvp_roadmap.length >= 5
        ? result.mvp_roadmap.slice(0, 5)
        : fallback.mvp_roadmap,
      first_10_actions: Array.isArray(result?.first_10_actions) && result.first_10_actions.length >= 10
        ? result.first_10_actions.slice(0, 10)
        : fallback.first_10_actions,
      gtm_plan: Array.isArray(result?.gtm_plan) && result.gtm_plan.length >= 5
        ? result.gtm_plan.slice(0, 5)
        : fallback.gtm_plan,
    };
  } catch {
    return fallback;
  }
}

function buildFocusAreaPrompt(focusAreas: string[]): string {
  if (focusAreas.length === 0) return "";
  return `\n\nFOUNDER-SELECTED FOCUS AREAS:\n${focusAreas.map((area) => `- ${area}`).join("\n")}\nPrioritize these areas in the analysis, risks, pivots, execution plan, and final recommendation. Do not ignore them.`;
}

// ─── Main route ───────────────────────────────────────────────────────────────


const BreakMyStartupSchema = z.object({
  userId:       z.string().min(1),
  projectId:    z.string().optional(),
  idea:         z.string().max(4000).optional(),
  stage:        z.string().optional(),
  focusAreas:   z.array(z.string()).max(10).optional(),
  executionMode: z.boolean().optional(),
});

export async function POST(request: Request) {
  let fallbackIdea = "";
  let fallbackStage = "Idea";
  let fallbackFocusAreas: string[] = [];
  let fallbackExecutionMode = false;
  try {
    const rawBody = await request.json().catch(() => ({}));
    const zodResult = BreakMyStartupSchema.safeParse(rawBody);
    if (!zodResult.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: zodResult.error.flatten() },
        { status: 400 }
      );
    }
    const body = zodResult.data;
    const userId = String(body?.userId ?? "").trim();
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    const idea = typeof body.idea === "string" ? body.idea.trim().slice(0, 4000) : "";
    const focusAreas = Array.isArray(body?.focusAreas)
      ? body.focusAreas.map(String).filter(Boolean).slice(0, 10)
      : [];
    const requestExecutionMode = Boolean(body?.executionMode);
    fallbackIdea = idea;
    fallbackStage = String(body?.stage ?? "Idea");
    fallbackFocusAreas = focusAreas;
    fallbackExecutionMode = requestExecutionMode;

    if (!userId) return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 });
    if (!projectId && !idea) return NextResponse.json({ success: false, error: "projectId or idea is required" }, { status: 400 });

    const routeUser = await getRouteUser();
    if (!routeUser || routeUser.userId !== userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // ── Free tier: preview only ───────────────────────────────────────────
    if (routeUser.plan !== "builder") {
      const previewScore = previewSignalScore(idea, focusAreas, String(body?.stage ?? "Idea"));
      return NextResponse.json({
        success: true,
        data: {
          gated: true,
          reasoning: [
            "Free preview uses only your written idea, not full project history",
            "Builder unlocks the 5-agent parallel pipeline with competitor scan",
            "Builder unlocks the Reflexion Loop with Verifier and Pivot Engine",
            `Preview signal score ${previewScore}`,
          ],
          verdict: "Preview only: this idea has enough signal to inspect, but the full stress test is Builder-only.",
          kill_reasons: [
            "The preview cannot verify demand, execution history, or competitive pressure without Builder analysis.",
          ],
          survive_reasons: [
            previewScore >= 50
              ? "Your description includes some useful market signal."
              : "You are stress-testing before overbuilding, which is already a good sign.",
          ],
          brutal_advice: "Upgrade to Builder to run the full 5-agent analysis with Reflexion Loop and Pivot Engine.",
          survival_probability: previewScore,
          competitor_summary: "Locked in preview. Builder runs the live competitor scan.",
          differentiation_plan: ["Locked in preview. Builder unlocks the differentiation plan."],
          // New fields — empty in preview
          viability_score: previewScore,
          viability_breakdown: null,
          pivots: [],
          execution_plan: null,
          reflexion_action: null,
          reflexion_status: "partial" satisfies ReflexionStatus,
        },
      });
    }

    await enforceAndTrackAIUsage(userId, routeUser.plan);

    // Learning loop: fetch patterns + mark stale rows (non-blocking)
    const [learnedPatterns] = await Promise.allSettled([
      getLearnedPatterns(userId),
      markIgnoredAfter24h(userId),
    ]);
    const patterns = learnedPatterns.status === "fulfilled" ? learnedPatterns.value : null;
    const learnedPatternsPrompt = patterns ? buildLearnedPatternsPrompt(patterns) : "";
    const focusAreaPrompt = buildFocusAreaPrompt(focusAreas);
    const sessionId = `bms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // ── Idea-only mode (no projectId) ─────────────────────────────────────
    if (!projectId) {
      // Scrape competitors
      const scrapeResult = await scrapeCompetitors(
        `${idea} startup tool software competitors`,
      );
      const competitors = scrapeResult.results;
      const competitors_scraped = scrapeResult.scraped;
      const competitor_data_source = scrapeResult.source ?? "none";

      // Parse idea into structured schema
      const parsed = await parseStartupIdea(idea);

      // Build startup context
      const startupCtx: StartupContext = {
        idea,
        problem: parsed.problem,
        targetUsers: parsed.target_customer,
        solution: parsed.solution,
        stage: String(body?.stage ?? "Idea"),
        competitors,
        focusAreas,
      };

      // Run 5-agent pipeline
      const agentPipeline = await runAgentPipeline(startupCtx);
      const signals = agentPipeline.signal_summary;

      // Viability score
      const monetizationClarity =
        parsed.monetization && parsed.monetization !== "Not specified" ? 65 : 35;
      const viabilityResult = computeViabilityScore(signals, monetizationClarity);
      const breakdownEntries = computeViabilityBreakdown(viabilityResult.breakdown);

      // Pivots
      const pivots = await generatePivots(startupCtx, signals, viabilityResult.viability_score);

      // Execution plan (if requested or if score is viable)
      let executionPlan: ExecutionPlan | null = null;
      if (requestExecutionMode || viabilityResult.viability_score >= 50) {
        executionPlan = await generateExecutionPlan(startupCtx, viabilityResult.viability_score);
      }

      // Reflexion pipeline — Stage 7 action
      const founderContext: ReflexionContext = {
        startupSummary: idea,
        stage: startupCtx.stage,
        problem: parsed.problem,
        targetUsers: parsed.target_customer,
        momentumScore: 50,
        domainDataPoints: competitors.length + 5,
      };

      let reflexionAction = null;
      let learningLogId: string | null = null;
      let reflexionStatus: ReflexionStatus = "partial";
      try {
        reflexionAction = await runFullReflexionPipeline({
          founderContext,
          agentPipeline,
          viabilityScore: viabilityResult,
          task: `What is the single highest-leverage next action for this founder?${focusAreaPrompt}`,
          executionMode: requestExecutionMode,
          learnedPatternsPrompt: `${learnedPatternsPrompt}${focusAreaPrompt}`,
        });

        // Record action shown — starts the learning loop for this run
        if (reflexionAction?.action) {
          learningLogId = await recordActionShown({
            userId,
            sessionId,
            stage: startupCtx.stage,
            actionShown: reflexionAction.action,
            criticPersona: reflexionAction._pipeline?.stage4_persona,
            viabilityScore: viabilityResult.viability_score,
            confidence: reflexionAction.confidence,
            verifierConfidence: reflexionAction._pipeline?.stage5_verifier?.confidence_score,
          }).catch(() => null);
        }
        reflexionStatus = reflexionAction ? "ok" : "partial";
      } catch (err) {
        reflexionStatus = "failed";
        console.error("[reflexion] break-my-startup idea mode failed:", err);
      }

      // Build legacy-compatible response shape
      const baseSignal = viabilityResult.viability_score;
      const competitorSummary = competitors.length > 0
        ? `DuckDuckGo found ${competitors.length} related products or pages. ${agentPipeline.competitor?.saturation_level === "high" ? "This is a crowded space — differentiation is critical." : "Competitive landscape shows room to differentiate."}`
        : "DuckDuckGo did not find clear direct competitors. Use more specific market terms for a better scan.";

      return NextResponse.json({
        success: true,
        data: {
          // ── Legacy fields (BreakMyStartup2.tsx compatibility) ──
          reasoning: [
            `Parsed idea into structured schema: ${parsed.category}`,
            focusAreas.length ? `Prioritized selected focus areas: ${focusAreas.join(", ")}` : "No focus areas selected",
            `5-agent pipeline completed in ${agentPipeline.duration_ms}ms`,
            `Found ${competitors.length} competitor(s) via DuckDuckGo`,
            `Viability score: ${viabilityResult.viability_score}/100 (${viabilityResult.verdict})`,
          ],
          verdict: viabilityResult.verdict_reason,
          kill_reasons: signals.all_risks.slice(0, 3).map(r => r.description),
          survive_reasons: signals.all_opportunities.slice(0, 2),
          brutal_advice: reflexionAction?.action ?? "Talk to 5 target users before writing a single line of code.",
          survival_probability: baseSignal,
          competitor_summary: competitorSummary,
          differentiation_plan: agentPipeline.competitor?.differentiation_opportunities?.slice(0, 3)
            ?? ["Identify the gap no competitor is addressing", "Own one specific niche", "Price differently"],
          competitors,
          focus_areas: focusAreas,

          // ── New fields ──
          parsed_schema: parsed,
          viability_score: viabilityResult.viability_score,
          viability_confidence: viabilityResult.confidence,
          viability_verdict: viabilityResult.verdict,
          viability_breakdown: viabilityResult.breakdown,
          viability_breakdown_labelled: breakdownEntries,
          signal_summary: {
            demand_score: signals.demand_score,
            competition_score: signals.competition_score,
            timing_score: signals.timing_score,
            uniqueness_score: signals.uniqueness_score,
            risk_score: signals.risk_score,
            overall_confidence: signals.overall_confidence,
          },
          agent_outputs: {
            market: agentPipeline.market,
            competitor: agentPipeline.competitor,
            trend: agentPipeline.trend,
            sentiment: agentPipeline.sentiment,
            risk: agentPipeline.risk,
          },
          agent_statuses: agentPipeline.agent_statuses,
          pivots,
          execution_plan: executionPlan,
          reflexion_action: reflexionAction
            ? {
                action: reflexionAction.action,
                rationale: reflexionAction.rationale,
                supporting_signals: reflexionAction.supporting_signals,
                confidence: reflexionAction.confidence,
                scores: reflexionAction.scores,
                log_row_id: learningLogId,
              }
            : null,
          reflexion_status: reflexionStatus,
          competitors_scraped,
          competitor_data_source,  // "ddg" | "brave" | "ai_synthesised" | "none"
          pipeline_duration_ms: agentPipeline.duration_ms,
        },
      });
    }

    if (!hasAdminEnv()) {
      const hintStage = String(body?.stage ?? "Idea");
      const hintScore = signalScore(0, 0, [], [], 0, 0, hintStage);
      return NextResponse.json({
        success: true,
        data: {
          reasoning: ["Supabase not configured — cannot read live project data", "Using stage-based baseline estimate"],
          verdict: "Connect Supabase to get a real analysis. Right now we can only see your project stage.",
          kill_reasons: ["No user interviews recorded", "No paying customers yet", "Validation data unavailable — configure Supabase"],
          survive_reasons: ["Founder is actively analyzing risks", "Stage-based signal suggests early momentum"],
          brutal_advice: "Add your SUPABASE_SERVICE_ROLE_KEY to env vars — then run this again for real data.",
          survival_probability: hintScore,
          differentiation_plan: ["Identify one thing none of your 3 closest competitors do", "Make that your only marketing message for 30 days", "Price differently — not cheaper, differently positioned"],
          competitors: [],
          competitor_summary: "Configure Supabase to enable live competitor scan.",
          viability_score: hintScore,
          viability_breakdown: null,
          pivots: [],
          execution_plan: null,
          reflexion_action: null,
          reflexion_status: "partial" satisfies ReflexionStatus,
        },
      });
    }

    const supabase = createAdminClient();

    // Load project + milestones + tasks in parallel
    const [projectResult, milestonesResult, founderContextResult] = await Promise.allSettled([
      supabase
        .from("projects")
        .select("name,title,description,target_users,problem,startup_stage,validation_strengths,validation_weaknesses,validation_score,execution_score")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single(),
      supabase
        .from("milestones")
        .select("id,title,is_completed")
        .eq("project_id", projectId),
      supabase
        .from("founder_context")
        .select("momentum_score,cognitive_load,consecutive_tasks_completed,days_inactive,avoidance_signals,topics_repeated")
        .eq("user_id", userId)
        .single(),
    ]);

    if (projectResult.status === "rejected" || projectResult.value.error) {
      throw new Error(
        projectResult.status === "rejected"
          ? "Failed to load project"
          : projectResult.value.error!.message,
      );
    }

    const project = projectResult.value.data!;
    const milestones = milestonesResult.status === "fulfilled"
      ? (milestonesResult.value.data ?? [])
      : [];
    const founderCtxRow = founderContextResult.status === "fulfilled"
      ? founderContextResult.value.data
      : null;

    // Load tasks for milestone IDs
    const milestoneIds = milestones.map(m => m.id);
    const { data: tasks } = milestoneIds.length
      ? await supabase.from("tasks").select("title,is_completed").in("milestone_id", milestoneIds)
      : { data: [] };

    // Compute execution metrics
    const completedTasks = (tasks ?? []).filter(t => t.is_completed).length;
    const totalTasks = (tasks ?? []).length;
    const completedMilestones = milestones.filter(m => m.is_completed).length;
    const totalMilestones = milestones.length;
    const taskRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const milestoneRate = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

    const strengths = project.validation_strengths ?? [];
    const weaknesses = project.validation_weaknesses ?? [];
    const stage = project.startup_stage ?? "Idea";
    const execScore = project.execution_score ?? 0;
    const valScore = project.validation_score ?? 0;
    const baseSignal = signalScore(taskRate, milestoneRate, strengths, weaknesses, execScore, valScore, stage);

    // Scrape competitors with two parallel queries (direct + broad)
    const [directResults, broadResults] = await Promise.allSettled([
      scrapeCompetitors(
        `${(project.name ?? project.title) ?? ""} ${project.problem ?? ""} startup site:producthunt.com OR site:crunchbase.com`,
      ),
      scrapeCompetitors(
        `${project.problem ?? project.description ?? ""} startup tool software`,
      ),
    ]);

    const rawCompetitors = [
      ...(directResults.status === "fulfilled" ? directResults.value.results : []),
      ...(broadResults.status === "fulfilled" ? broadResults.value.results : []),
    ];
    const competitors_scraped =
      (directResults.status === "fulfilled" && directResults.value.scraped) ||
      (broadResults.status === "fulfilled" && broadResults.value.scraped);
    const competitor_data_source =
      (directResults.status === "fulfilled" && directResults.value.source) ||
      (broadResults.status === "fulfilled" && broadResults.value.source) ||
      "none";
    const seen = new Set<string>();
    const competitors = rawCompetitors.filter(c => {
      try {
        const d = new URL(c.url).hostname;
        if (seen.has(d)) return false;
        seen.add(d);
        return true;
      } catch { return false; }
    }).slice(0, 5);

    // Build startup context from project data
    const startupCtx: StartupContext = {
      idea: `${(project.name ?? project.title) ?? ""} — ${project.description ?? ""}`,
      problem: project.problem ?? "",
      targetUsers: project.target_users ?? "",
      solution: project.description ?? "",
      stage,
      competitors,
      validationStrengths: strengths,
      validationWeaknesses: weaknesses,
      executionScore: execScore,
      momentumScore: founderCtxRow?.momentum_score ?? 50,
      focusAreas,
    };

    // Run 5-agent pipeline with full project context
    const agentPipeline = await runAgentPipeline(startupCtx);
    const signals = agentPipeline.signal_summary;

    // Viability score — blend agent signals with execution data
    const executionBoost = Math.round(execScore * 0.15);
    const rawViability = computeViabilityScore(signals);
    const viabilityResult = {
      ...rawViability,
      viability_score: Math.min(97, Math.max(3, rawViability.viability_score + executionBoost)),
    };
    const breakdownEntries = computeViabilityBreakdown(viabilityResult.breakdown);

    // Pivots
    const pivots = await generatePivots(startupCtx, signals, viabilityResult.viability_score);

    // Execution plan
    let executionPlan: ExecutionPlan | null = null;
    if (requestExecutionMode || viabilityResult.viability_score >= 45) {
      executionPlan = await generateExecutionPlan(startupCtx, viabilityResult.viability_score);
    }

    // Build Reflexion context from founder_context row
    const founderReflexionCtx: ReflexionContext = {
      startupSummary: (project.name ?? project.title) ?? idea,
      stage,
      problem: project.problem ?? undefined,
      targetUsers: project.target_users ?? undefined,
      momentumScore: founderCtxRow?.momentum_score ?? 50,
      cognitiveLoad: (founderCtxRow?.cognitive_load as "fresh" | "drained" | "autopilot") ?? "fresh",
      consecutiveTasksCompleted: founderCtxRow?.consecutive_tasks_completed ?? 0,
      daysInactive: founderCtxRow?.days_inactive ?? 0,
      avoidanceSignals: founderCtxRow?.avoidance_signals ?? [],
      topicsRepeated: founderCtxRow?.topics_repeated ?? [],
      domainDataPoints: competitors.length + strengths.length + totalTasks,
    };

    // Run full Reflexion pipeline (Stages 0–7)
    let reflexionAction = null;
    let learningLogId: string | null = null;
    let reflexionStatus: ReflexionStatus = "partial";
    try {
      reflexionAction = await runFullReflexionPipeline({
        founderContext: founderReflexionCtx,
        agentPipeline,
        viabilityScore: viabilityResult,
        task: `Given this founder's project data and the agent analysis, what is the single highest-leverage next move?${focusAreaPrompt}`,
        executionMode: requestExecutionMode,
        learnedPatternsPrompt: `${learnedPatternsPrompt}${focusAreaPrompt}`,
      });

      // Record action shown — starts the learning loop for this run
      if (reflexionAction?.action) {
        learningLogId = await recordActionShown({
          userId,
          projectId,
          sessionId,
          stage,
          actionShown: reflexionAction.action,
          criticPersona: reflexionAction._pipeline?.stage4_persona,
          viabilityScore: viabilityResult.viability_score,
          confidence: reflexionAction.confidence,
          verifierConfidence: reflexionAction._pipeline?.stage5_verifier?.confidence_score,
        }).catch(() => null);
      }
      reflexionStatus = reflexionAction ? "ok" : "partial";
    } catch (err) {
      reflexionStatus = "failed";
      console.error("[reflexion] break-my-startup project mode failed:", err);
    }

    // Iteration delta — load previous analysis if available
    let iterationDelta = null;
    try {
      const { data: prevAnalysis } = await supabase
        .from("founder_context")
        .select("last_break_analysis")
        .eq("user_id", userId)
        .single();

      if (prevAnalysis?.last_break_analysis) {
        const prev = prevAnalysis.last_break_analysis as IterationRecord;
        if (prev.viability_score && prev.breakdown) {
          const current: IterationRecord = {
            run_id: `${Date.now()}`,
            timestamp: new Date().toISOString(),
            viability_score: viabilityResult.viability_score,
            breakdown: viabilityResult.breakdown,
            idea_snapshot: (project.name ?? project.title) ?? "",
          };
          iterationDelta = computeIterationDelta(prev, current);

          // Save current as last_break_analysis (fire-and-forget)
          void Promise.resolve(
            supabase
              .from("founder_context")
              .update({ last_break_analysis: current })
              .eq("user_id", userId)
              .then(() => {}),
          ).catch((err) => logError("break-my-startup/founderContextUpdate", err));
        }
      }
    } catch { /* non-fatal — iteration tracking is additive */ }

    // Log to reflexion quality log
    if (reflexionAction?.action) {
      logReflexionQuality({
        userId,
        projectId,
        context: "break_my_startup",
        originalOutput: reflexionAction._pipeline.stage3_generated,
        finalOutput: reflexionAction.action,
        stage,
        targetUsers: project.target_users ?? undefined,
        momentumScore: founderCtxRow?.momentum_score ?? 50,
      }).catch((err) => logError("break-my-startup/logReflexionQuality", err));
    }

    // Build legacy-compatible response
    const competitorSummary = competitors.length > 0
      ? `Found ${competitors.length} potential competitors — ${agentPipeline.competitor?.saturation_level === "high" ? "this is a crowded space, differentiation is critical." : "differentiation opportunities identified."}`
      : "No clear competitors found — run with more specific search terms.";

    return NextResponse.json({
      success: true,
      data: {
        // ── Legacy fields (BreakMyStartup2.tsx compatibility) ──
        reasoning: [
          `Read ${completedTasks}/${totalTasks} tasks and ${completedMilestones}/${totalMilestones} milestones`,
          focusAreas.length ? `Prioritized selected focus areas: ${focusAreas.join(", ")}` : "No focus areas selected",
          `5-agent pipeline completed in ${agentPipeline.duration_ms}ms`,
          `Found ${competitors.length} competitor(s) via live web scan`,
          `Viability score: ${viabilityResult.viability_score}/100 — ${viabilityResult.verdict}`,
        ],
        verdict: viabilityResult.verdict_reason,
        kill_reasons: signals.all_risks.slice(0, 3).map(r => r.description),
        survive_reasons: signals.all_opportunities.slice(0, 2),
        brutal_advice: reflexionAction?.action
          ?? "Run 5 user interviews this week and report back on willingness to pay.",
        survival_probability: viabilityResult.viability_score,
        competitor_summary: competitorSummary,
        differentiation_plan: agentPipeline.competitor?.differentiation_opportunities?.slice(0, 3)
          ?? ["Identify the gap no competitor addresses", "Own one specific niche for 60 days", "Price based on outcomes, not features"],
        competitors,
        focus_areas: focusAreas,

        // ── New fields ──
        viability_score: viabilityResult.viability_score,
        viability_confidence: viabilityResult.confidence,
        viability_verdict: viabilityResult.verdict,
        viability_verdict_reason: viabilityResult.verdict_reason,
        viability_breakdown: viabilityResult.breakdown,
        viability_breakdown_labelled: breakdownEntries,
        signal_summary: {
          demand_score: signals.demand_score,
          competition_score: signals.competition_score,
          timing_score: signals.timing_score,
          uniqueness_score: signals.uniqueness_score,
          risk_score: signals.risk_score,
          overall_confidence: signals.overall_confidence,
        },
        agent_outputs: {
          market: agentPipeline.market,
          competitor: agentPipeline.competitor,
          trend: agentPipeline.trend,
          sentiment: agentPipeline.sentiment,
          risk: agentPipeline.risk,
        },
        agent_statuses: agentPipeline.agent_statuses,
        pivots,
        execution_plan: executionPlan,
        reflexion_action: reflexionAction
          ? {
              action: reflexionAction.action,
              rationale: reflexionAction.rationale,
              supporting_signals: reflexionAction.supporting_signals,
              risks: reflexionAction.risks,
              confidence: reflexionAction.confidence,
              scores: reflexionAction.scores,
              log_row_id: learningLogId,
            }
          : null,
        reflexion_status: reflexionStatus,
        iteration_delta: iterationDelta,
        execution_metrics: {
          task_completion_rate: taskRate,
          milestone_completion_rate: milestoneRate,
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          base_signal_score: baseSignal,
        },
        competitors_scraped,
        pipeline_duration_ms: agentPipeline.duration_ms,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Analysis failed";
    if (fallbackIdea) {
      const score = previewSignalScore(fallbackIdea, fallbackFocusAreas, fallbackStage);
      const execution_plan = fallbackExecutionMode || score >= 45
        ? {
            mvp_roadmap: [
              "Define the narrowest user segment and the painful workflow they repeat weekly",
              "Turn the idea into one testable promise and one landing-page headline",
              "Create a clickable mockup or no-code prototype for the core workflow",
              "Put it in front of 5 target users and record every confusion point",
              "Ship the smallest paid or waitlist version based on what those users actually did",
            ],
            first_10_actions: [
              "Write the one-sentence pitch for this exact user",
              "List 20 people or communities where that user already gathers",
              "Send 5 problem-discovery messages today",
              "Document the top 3 current workarounds",
              "Pick the one feature needed to prove demand",
              "Sketch the core flow in 30 minutes",
              "Ask 3 users to react to the sketch",
              "Choose one pricing hypothesis",
              "Create a simple waitlist or checkout test",
              "Review replies and decide what to cut",
            ],
            gtm_plan: [
              "Start with one niche channel where target users already ask for help",
              "Publish the problem in the user's words, not product language",
              "DM people who engage and ask for a short call",
              "Convert calls into a small beta list",
              "Use the first beta outcomes as proof for the next outreach wave",
            ],
          }
        : null;

      return NextResponse.json({
        success: true,
        data: {
          reasoning: ["Fallback custom-idea analysis returned because the live pipeline failed", msg],
          verdict: "The live stress-test pipeline could not finish, but the idea still has enough signal to produce a useful next move.",
          kill_reasons: ["Demand is not proven yet", "The target user may be too broad", "The first version could become too large"],
          survive_reasons: ["You are testing the idea before overbuilding", "A narrow user segment can make the next step clear"],
          brutal_advice: "Talk to 5 specific target users before building. If they will not give time, they probably will not give money.",
          survival_probability: score,
          competitor_summary: "Competitor scan unavailable in fallback mode. Re-run later for live market context.",
          differentiation_plan: ["Own one narrow niche", "Use the user's exact painful language", "Prove willingness to pay before polishing"],
          competitors: [],
          focus_areas: fallbackFocusAreas,
          viability_score: score,
          viability_breakdown: null,
          pivots: [],
          execution_plan,
          reflexion_action: null,
          reflexion_status: "partial" satisfies ReflexionStatus,
          competitors_scraped: false,
          competitor_data_source: "fallback",
        },
      });
    }
    return NextResponse.json(
      { success: false, error: msg },
      { status: msg.toLowerCase().includes("limit") ? 429 : 500 },
    );
  }
}
