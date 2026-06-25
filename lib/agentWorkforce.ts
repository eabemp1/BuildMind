/**
 * lib/agentWorkforce.ts — Agent Workforce Engine
 *
 * Three specialized agents — Research, Validation, Competitor — each with
 * their own identity, mission scope, and report format.
 *
 * Architecture (per Vision doc):
 *   Founder Context
 *        ↑
 *   Human Approved Findings   ← founder confirms via /api/agents/confirm
 *        ↑
 *   agent_findings table       ← THIS lib writes here only
 *
 * Agents NEVER write directly to founder_context or founder_memory.
 * Every finding has: evidence, confidence, recommendation. Never bare assertions.
 *
 * Report format: top 3 findings + top risk + recommended action.
 * NOT a 10-page wall of text.
 *
 * SERVER-SIDE ONLY. Import only from API routes.
 */

import { callModelJSON } from "@/lib/ai-providers";
import { webSearch, discussionSearch, newsSearch, competitorSearch, type SearchResult } from "@/lib/search";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitPulse } from "@/lib/pulse";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentType = "research" | "validation" | "competitor";
export type AgentVerdict = "proceed" | "pivot" | "kill" | "inconclusive";

export type SignalType =
  | "demand_confirmed"
  | "demand_absent"
  | "competitor_gap"
  | "competitor_strong"
  | "pivot_candidate"
  | "user_pain"
  | "willingness_to_pay"
  | "timing_good"
  | "timing_bad"
  | "abandon_signal";

export interface AgentFinding {
  signal_type:  SignalType;
  positive:     boolean;
  confidence:   number;     // 0–1
  title:        string;
  evidence:     string;     // specific reasoning — NEVER bare assertions
  source_type:  "reasoning" | "pattern_match";
  action_hint:  string;
}

export interface AgentRunInput {
  runId:          string;
  userId:         string;
  projectId:      string | null;
  agentType:      AgentType;
  stage:          string;
  startupTitle:   string;
  startupSummary: string;
  problem:        string;
  targetUsers:    string;
  maxIterations:  number;
}

export interface AgentRunResult {
  verdict:           AgentVerdict;
  topFindings:       [string, string, string];
  topRisk:           string;
  recommendedAction: string;
  confidencePct:     number;
  signalsFound:      number;
  reportMarkdown:    string;
  findings:          AgentFinding[];
}

// ── Agent identity ────────────────────────────────────────────────────────────
// Each agent has a name, a clear job description, and a focused scope.
// "People buy jobs, not architecture."

export const AGENT_IDENTITY = {
  research: {
    name:        "Research Agent",
    tagline:     "Market research, industry trends, user sentiment",
    description: "Analyses market size, demand patterns, existing solutions, and user sentiment across the problem space. Produces a research report with confidence scores.",
    currentAction: [
      "Analysing market demand patterns…",
      "Reviewing industry trends…",
      "Mapping user sentiment signals…",
      "Synthesising research findings…",
    ],
  },
  validation: {
    name:        "Validation Agent",
    tagline:     "Assumption testing, pain point analysis, pivot indicators",
    description: "Tests the founder's core assumptions against evidence. Finds proof or disproof of user pain, willingness to pay, and problem urgency.",
    currentAction: [
      "Testing core assumptions…",
      "Analysing pain point evidence…",
      "Checking willingness to pay signals…",
      "Evaluating pivot indicators…",
    ],
  },
  competitor: {
    name:        "Competitor Agent",
    tagline:     "Competitor tracking, positioning gaps, launch monitoring",
    description: "Maps the competitive landscape, identifies gaps in existing solutions, and detects whether incumbents block entry or leave room for a wedge.",
    currentAction: [
      "Mapping the competitive landscape…",
      "Identifying positioning gaps…",
      "Analysing competitor weaknesses…",
      "Detecting market entry opportunities…",
    ],
  },
} as const;

// ── Stage-calibrated criteria ─────────────────────────────────────────────────

const STAGE_FOCUS: Record<string, { focus: string; proceedThreshold: number; killThreshold: number }> = {
  Idea: {
    focus: "Is this problem real, urgent, and specific enough for a defined user group?",
    proceedThreshold: 52,
    killThreshold: 22,
  },
  Validation: {
    focus: "Is there evidence of willingness to pay, not just expressed interest?",
    proceedThreshold: 58,
    killThreshold: 25,
  },
  MVP: {
    focus: "Is the solution differentiated enough that users would switch to it?",
    proceedThreshold: 62,
    killThreshold: 28,
  },
  Launch: {
    focus: "Is there a repeatable acquisition channel showing organic traction?",
    proceedThreshold: 65,
    killThreshold: 32,
  },
  Growth: {
    focus: "Is retention strong enough to justify scaling spend?",
    proceedThreshold: 68,
    killThreshold: 36,
  },
};

function getStageFocus(stage: string) {
  const key = Object.keys(STAGE_FOCUS).find(k =>
    stage.toLowerCase().includes(k.toLowerCase())
  ) ?? "Idea";
  return STAGE_FOCUS[key];
}

// ── Agent system prompts ──────────────────────────────────────────────────────

function buildSystemPrompt(agentType: AgentType, stage: string): string {
  const identity = AGENT_IDENTITY[agentType];
  const stageFocus = getStageFocus(stage);

  const scopeInstructions = {
    research: `Focus on:
- Market demand: are people actively searching for solutions to this problem?
- Industry trends: is the market growing, shrinking, or in flux?
- User sentiment: what are people saying about this problem in communities?
- Existing solutions: are there workarounds that prove the problem exists?`,
    validation: `Focus on:
- Core assumptions: what must be true for this startup to work? Are they?
- Pain intensity: is this a vitamin (nice to have) or painkiller (urgent)?
- Willingness to pay: are there pricing signals from analogous products?
- Pivot indicators: if this exact idea doesn't work, what adjacent idea might?`,
    competitor: `Focus on:
- Who already exists in this space and what they do well/poorly
- Gaps in existing solutions that a new entrant could exploit
- Barriers to entry: do incumbents block the market or leave room?
- Positioning opportunities: where is there a defensible wedge?`,
  }[agentType];

  return `You are BuildMind's ${identity.name}.

Your job: ${identity.description}

Stage context: ${stageFocus.focus}

${scopeInstructions}

CRITICAL RULES:
1. Never make bare assertions. Every finding needs evidence and a confidence score.
   Wrong: "Users want this."
   Right: "72% confidence users want this because [specific reasoning with analogies/patterns]"
2. Confidence should be honest. Most findings without real user data are 0.35–0.65.
   Reserve 0.8+ for findings backed by strong market analogies or clear patterns.
3. Negative signals are as valuable as positive ones. Don't bias toward optimism.
4. Source type is always "reasoning" — you are reasoning from patterns, not scraping.

Return ONLY valid JSON. No markdown fences.`;
}

// ── Search context builder ────────────────────────────────────────────────────
// Each agent type runs different search queries to get real market data.
// Results are injected into the AI prompt as grounded evidence.

async function fetchSearchContext(input: AgentRunInput, iteration: number): Promise<string> {
  const { startupTitle, problem, targetUsers, agentType } = input;

  try {
    if (agentType === "research") {
      // Research agent: market demand + discussion signals
      const [webResults, discussionResults] = await Promise.allSettled([
        webSearch(`${problem} ${targetUsers} market demand`, 8),
        discussionSearch(`${problem} ${targetUsers} pain points`, 8),
      ]);
      const web  = webResults.status  === "fulfilled" ? webResults.value.results  : [];
      const disc = discussionResults.status === "fulfilled" ? discussionResults.value.results : [];
      const all  = [...web, ...disc].slice(0, 12);
      if (all.length === 0) return "";
      return formatSearchContext(all, webResults.status === "fulfilled" ? webResults.value.provider : "none");
    }

    if (agentType === "validation") {
      // Validation agent: community discussions + willingness to pay signals
      const [discussions, pricingSearch] = await Promise.allSettled([
        discussionSearch(`${problem} people looking for solution`, 8),
        webSearch(`${problem} pricing how much pay subscription ${targetUsers}`, 6),
      ]);
      const disc    = discussions.status    === "fulfilled" ? discussions.value.results    : [];
      const pricing = pricingSearch.status  === "fulfilled" ? pricingSearch.value.results  : [];
      const all = [...disc, ...pricing].slice(0, 12);
      if (all.length === 0) return "";
      return formatSearchContext(all, discussions.status === "fulfilled" ? discussions.value.provider : "none");
    }

    if (agentType === "competitor") {
      // Competitor agent: direct competitor search + recent news
      const [comps, news] = await Promise.allSettled([
        competitorSearch(startupTitle, problem),
        newsSearch(`${startupTitle} ${problem} startup competitor launch 2025`, 6),
      ]);
      const compResults = comps.status === "fulfilled" ? comps.value.results : [];
      const newsResults = news.status  === "fulfilled" ? news.value.results  : [];
      const all = [...compResults, ...newsResults].slice(0, 14);
      if (all.length === 0) return "";
      return formatSearchContext(all, comps.status === "fulfilled" ? comps.value.provider : "none");
    }

    return "";
  } catch {
    return "";
  }
}

function formatSearchContext(results: SearchResult[], provider: string): string {
  if (results.length === 0) return "";
  const providerLabel = provider === "ai_synthesised"
    ? "AI-synthesised (no live search available)"
    : `Live web search via ${provider}`;

  return `\n\nLIVE SEARCH RESULTS (${providerLabel}):\n${
    results.map((r, i) =>
      `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.snippet ? `Summary: ${r.snippet.slice(0, 200)}` : ""}${r.age ? ` (${r.age})` : ""}`
    ).join("\n\n")
  }\n\nUse these results as concrete evidence. Cite specific titles or URLs when they support a finding. If results are AI-synthesised, note lower confidence.`;
}

// ── Research iteration ────────────────────────────────────────────────────────

async function runIteration(
  input: AgentRunInput,
  iteration: number,
  previousFindings: AgentFinding[],
): Promise<AgentFinding[]> {
  const systemPrompt = buildSystemPrompt(input.agentType, input.stage);

  // Fetch real search context — this is what makes agents more than prompts
  const searchContext = await fetchSearchContext(input, iteration);

  const prevSummary = previousFindings.length > 0
    ? `Previous findings (${previousFindings.length} total):\n${
        previousFindings.slice(-6).map(f =>
          `- [${f.positive ? "+" : "-"}] ${f.signal_type} | ${f.title} | conf: ${f.confidence}`
        ).join("\n")
      }\n\nGo deeper. Avoid repeating confirmed findings. Focus on gaps.`
    : "First iteration — start broad, then focus on the highest-leverage questions.";

  const userPrompt = `Startup: ${input.startupTitle}
Problem: ${input.problem}
Summary: ${input.startupSummary}
Target users: ${input.targetUsers}
Stage: ${input.stage}
${searchContext}

${prevSummary}

Iteration ${iteration} of ${input.maxIterations}.

Produce 3–5 findings grounded in the search results above where available.
Each finding must follow this exact structure:
{
  "signal_type": "demand_confirmed|demand_absent|competitor_gap|competitor_strong|pivot_candidate|user_pain|willingness_to_pay|timing_good|timing_bad|abandon_signal",
  "positive": true|false,
  "confidence": 0.0–1.0,
  "title": "one-line summary of the finding",
  "evidence": "cite specific search results by title/URL where possible. If using reasoning, explain why. Never vague.",
  "source_type": "${searchContext ? "web_search" : "reasoning"}",
  "action_hint": "one concrete action the founder should take based on this finding"
}

Return: { "findings": [ ... ] }`;

  try {
    const result = await callModelJSON<{ findings: AgentFinding[] }>(
      [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      { maxTokens: 1600 },
    );
    return (result?.findings ?? [])
      .slice(0, 6)
      .map(f => ({
        ...f,
        confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.4)),
        source_type: (searchContext ? "web_search" : "reasoning") as AgentFinding["source_type"],
      }));
  } catch {
    return [];
  }
}

// ── Verdict ───────────────────────────────────────────────────────────────────

async function buildVerdict(
  input: AgentRunInput,
  allFindings: AgentFinding[],
): Promise<{
  verdict: AgentVerdict;
  topFindings: [string, string, string];
  topRisk: string;
  recommendedAction: string;
  confidencePct: number;
}> {
  const stageFocus = getStageFocus(input.stage);
  const positive = allFindings.filter(f => f.positive);
  const negative = allFindings.filter(f => !f.positive);

  const avgConf = allFindings.length > 0
    ? allFindings.reduce((s, f) => s + f.confidence, 0) / allFindings.length
    : 0;
  const score = Math.round(
    (positive.reduce((s, f) => s + f.confidence, 0) -
     negative.reduce((s, f) => s + f.confidence, 0) * 0.8 + 2) /
    Math.max(allFindings.length, 1) * 50 + 50
  );

  const systemPrompt = `You are the BuildMind verdict agent.
Deliver the verdict. Be direct. Founders waste years because nobody told them the truth.

Return ONLY valid JSON. No markdown.`;

  const userPrompt = `Startup: ${input.startupTitle}
Agent: ${AGENT_IDENTITY[input.agentType].name}
Stage: ${input.stage}
Score: ${Math.max(0, Math.min(100, score))}/100
Proceed threshold: ${stageFocus.proceedThreshold}
Kill threshold: ${stageFocus.killThreshold}

Positive signals (${positive.length}):
${positive.map(f => `- ${f.title} [conf: ${f.confidence}]: ${f.evidence.slice(0, 100)}`).join("\n")}

Negative signals (${negative.length}):
${negative.map(f => `- ${f.title} [conf: ${f.confidence}]: ${f.evidence.slice(0, 100)}`).join("\n")}

Return:
{
  "verdict": "proceed|pivot|kill|inconclusive",
  "top_finding_1": "the single most important positive finding — specific, one sentence",
  "top_finding_2": "second most important finding — could be positive or negative",
  "top_finding_3": "third finding — the one that changes what the founder does next",
  "top_risk": "the single biggest risk this agent found — honest, no softening",
  "recommended_action": "Proceed — [why] | Pivot to [specific adjacent idea] | Kill — [honest 1-sentence reason] | Inconclusive — [what to validate next]"
}`;

  try {
    const r = await callModelJSON<{
      verdict: AgentVerdict;
      top_finding_1: string;
      top_finding_2: string;
      top_finding_3: string;
      top_risk: string;
      recommended_action: string;
    }>(
      [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      { maxTokens: 700 },
    );

    return {
      verdict:           r?.verdict ?? "inconclusive",
      topFindings:       [r?.top_finding_1 ?? "", r?.top_finding_2 ?? "", r?.top_finding_3 ?? ""],
      topRisk:           r?.top_risk ?? "",
      recommendedAction: r?.recommended_action ?? "Inconclusive — gather more data.",
      confidencePct:     Math.round(avgConf * 100),
    };
  } catch {
    return {
      verdict:           "inconclusive",
      topFindings:       ["Analysis incomplete", "", ""],
      topRisk:           "Could not complete verdict — AI provider unavailable.",
      recommendedAction: "Retry when AI provider is available.",
      confidencePct:     Math.round(avgConf * 100),
    };
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
// Intentionally concise. High signal, low noise.

function buildReport(
  input: AgentRunInput,
  findings: AgentFinding[],
  verdict: AgentVerdict,
  topFindings: [string, string, string],
  topRisk: string,
  recommendedAction: string,
  confidencePct: number,
): string {
  const identity = AGENT_IDENTITY[input.agentType];
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const verdictEmoji = { proceed: "🟢", pivot: "🟡", kill: "🔴", inconclusive: "⚪" }[verdict];
  const verdictLabel = {
    proceed:      "Proceed",
    pivot:        "Pivot Recommended",
    kill:         "Kill — Stop Building This",
    inconclusive: "Inconclusive",
  }[verdict];

  const positive = findings.filter(f => f.positive);
  const negative = findings.filter(f => !f.positive);

  return `# ${identity.name} Report — ${input.startupTitle}
*${date} · ${findings.length} signals · Stage: ${input.stage} · Confidence: ${confidencePct}%*

---

## ${verdictEmoji} ${verdictLabel}

**Recommended action:** ${recommendedAction}

---

## Top 3 Findings

1. ${topFindings[0]}
2. ${topFindings[1] || "No second finding"}
3. ${topFindings[2] || "No third finding"}

**Top risk:** ${topRisk}

---

## All Signals

### Positive (${positive.length})
${positive.length === 0 ? "_None found._" : positive.map(f =>
  `**${f.title}** *(${f.signal_type.replace(/_/g, " ")} · ${Math.round(f.confidence * 100)}% confidence)*\n${f.evidence}\n→ ${f.action_hint}`
).join("\n\n")}

### Negative (${negative.length})
${negative.length === 0 ? "_None found._" : negative.map(f =>
  `**${f.title}** *(${f.signal_type.replace(/_/g, " ")} · ${Math.round(f.confidence * 100)}% confidence)*\n${f.evidence}\n→ ${f.action_hint}`
).join("\n\n")}

---

*${identity.name} synthesises from patterns and reasoning. Validate the strongest signals through direct user conversations.*`;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreFindings(findings: AgentFinding[]): number {
  const WEIGHTS: Record<SignalType, number> = {
    willingness_to_pay: 18,
    demand_confirmed:   14,
    user_pain:          12,
    competitor_gap:     10,
    timing_good:         8,
    pivot_candidate:     5,
    demand_absent:      -12,
    competitor_strong:   -8,
    timing_bad:          -6,
    abandon_signal:     -18,
  };

  const raw = findings.reduce((sum, f) => {
    const w = WEIGHTS[f.signal_type] ?? 5;
    return sum + (f.positive ? 1 : -1) * f.confidence * Math.abs(w);
  }, 50);

  return Math.max(0, Math.min(100, Math.round(raw)));
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function runAgentWorkforce(input: AgentRunInput): Promise<AgentRunResult> {
  const admin = createAdminClient();
  const identity = AGENT_IDENTITY[input.agentType];
  const stageFocus = getStageFocus(input.stage);
  const allFindings: AgentFinding[] = [];

  // Mark as running
  await admin.from("agent_runs").update({
    status:         "running",
    current_action: identity.currentAction[0],
    updated_at:     new Date().toISOString(),
  }).eq("id", input.runId);

  for (let i = 1; i <= input.maxIterations; i++) {
    // Update current action display
    const actionIdx = Math.min(i - 1, identity.currentAction.length - 1);
    await admin.from("agent_runs").update({
      iteration:      i,
      current_action: identity.currentAction[actionIdx],
      updated_at:     new Date().toISOString(),
    }).eq("id", input.runId);

    const iterFindings = await runIteration(input, i, allFindings);
    allFindings.push(...iterFindings);

    // Persist findings to isolation layer
    if (iterFindings.length > 0) {
      await admin.from("agent_findings").insert(
        iterFindings.map(f => ({
          run_id:    input.runId,
          user_id:   input.userId,
          iteration: i,
          ...f,
          founder_confirmed: null,  // always null — never auto-promote
        }))
      ).then(() => {}).catch(() => {});
    }

    const score = scoreFindings(allFindings);
    const avgConf = allFindings.length > 0
      ? Math.round(allFindings.reduce((s, f) => s + f.confidence, 0) / allFindings.length * 100)
      : 0;

    await admin.from("agent_runs").update({
      signals_found:  allFindings.length,
      confidence_pct: avgConf,
      updated_at:     new Date().toISOString(),
    }).eq("id", input.runId);

    // Emit Pulse event
    emitPulse(input.userId, "break_used", input.projectId, {
      stage: input.stage,
      metadata: {
        agent_run_id: input.runId,
        agent_type:   input.agentType,
        iteration:    i,
        score,
      },
    }).catch(() => {});

    // Early exits
    if (i >= 2 && score < stageFocus.killThreshold - 8) break;
    if (i >= 2 && score >= stageFocus.proceedThreshold + 15) break;
  }

  const verdictResult = await buildVerdict(input, allFindings);

  const reportMarkdown = buildReport(
    input,
    allFindings,
    verdictResult.verdict,
    verdictResult.topFindings,
    verdictResult.topRisk,
    verdictResult.recommendedAction,
    verdictResult.confidencePct,
  );

  // Write final state
  await admin.from("agent_runs").update({
    status:             "complete",
    current_action:     "Report ready",
    verdict:            verdictResult.verdict,
    top_finding_1:      verdictResult.topFindings[0],
    top_finding_2:      verdictResult.topFindings[1],
    top_finding_3:      verdictResult.topFindings[2],
    top_risk:           verdictResult.topRisk,
    recommended_action: verdictResult.recommendedAction,
    confidence_pct:     verdictResult.confidencePct,
    signals_found:      allFindings.length,
    report_markdown:    reportMarkdown,
    completed_at:       new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  }).eq("id", input.runId);

  return {
    verdict:           verdictResult.verdict,
    topFindings:       verdictResult.topFindings,
    topRisk:           verdictResult.topRisk,
    recommendedAction: verdictResult.recommendedAction,
    confidencePct:     verdictResult.confidencePct,
    signalsFound:      allFindings.length,
    reportMarkdown,
    findings:          allFindings,
  };
}
