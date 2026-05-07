/**
 * lib/agents/index.ts — Multi-Agent Orchestrator
 *
 * Five specialist agents run in parallel via Promise.allSettled.
 * Each agent has a single responsibility, returns typed JSON,
 * and includes a confidence score on every claim.
 *
 * Agent roster:
 *   1. MarketResearchAgent   — demand signals, market size, growth trajectory
 *   2. CompetitorAgent       — competitive landscape, gaps, saturation level
 *   3. TrendAgent            — timing signals, macro tailwinds/headwinds
 *   4. SentimentAgent        — user pain points, community signals, demand authenticity
 *   5. RiskAgent             — execution risks, blind spots, failure modes
 *
 * Orchestrator:
 *   runAgentPipeline()       — runs all 5 in parallel, collects results,
 *                              returns AgentPipelineResult with per-agent
 *                              outputs + a merged signal summary
 *
 * Data strategy:
 *   - Competitor data comes from DuckDuckGo scraping (passed in from route)
 *   - All agents reason from: scraped data + founder context + training knowledge
 *   - Every claim has a confidence score (0–1). Low confidence → flagged.
 *   - No hallucinated statistics. Agents must hedge when uncertain.
 *
 * Usage (server-side only):
 *   import { runAgentPipeline } from "@/lib/agents";
 *   const pipeline = await runAgentPipeline({ idea, stage, competitors, ... });
 */

import { callModelJSON } from "@/lib/ai-providers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StartupContext {
  idea: string;
  problem: string;
  targetUsers: string;
  solution: string;
  stage: string;
  competitors: ScrapedCompetitor[];
  focusAreas?: string[];
  // Optional enrichment from project data
  validationStrengths?: string[];
  validationWeaknesses?: string[];
  executionScore?: number;
  momentumScore?: number;
}

export interface ScrapedCompetitor {
  title: string;
  url: string;
  snippet: string;
}

// ── Agent output types ────────────────────────────────────────────────────────

export interface MarketResearchOutput {
  market_size_signal: "niche" | "mid" | "large" | "unknown";
  demand_authenticity: "real" | "manufactured" | "uncertain";
  growth_trajectory: "growing" | "flat" | "declining" | "unknown";
  demand_signals: string[];           // concrete evidence of demand
  demand_gaps: string[];              // underserved segments or needs
  target_customer_fit: string;        // how well idea matches stated target users
  confidence: number;                 // 0–1
  reasoning: string;                  // internal reasoning chain
}

export interface CompetitorOutput {
  saturation_level: "low" | "medium" | "high" | "unknown";
  direct_competitors: CompetitorSummary[];
  indirect_competitors: string[];
  market_gaps: string[];              // what competitors are NOT doing
  differentiation_opportunities: string[];
  competitive_moat_score: number;     // 0–10: how defensible is this space
  confidence: number;
  reasoning: string;
}

export interface CompetitorSummary {
  name: string;
  url?: string;
  weakness: string;                   // their specific gap this founder can exploit
  threat_level: "low" | "medium" | "high";
}

export interface TrendOutput {
  timing_signal: "early" | "right" | "late" | "unknown";
  macro_tailwinds: string[];          // forces working IN favour
  macro_headwinds: string[];          // forces working AGAINST
  window_of_opportunity: string;      // specific timing narrative
  trend_confidence: number;           // 0–1
  confidence: number;
  reasoning: string;
}

export interface SentimentOutput {
  pain_intensity: "low" | "medium" | "high" | "unknown";
  user_pain_points: string[];         // real complaints/frustrations found
  demand_signals: string[];           // evidence people want a solution
  community_signals: string[];        // forum/community evidence
  willingness_to_pay_signal: "unlikely" | "possible" | "likely" | "unknown";
  confidence: number;
  reasoning: string;
}

export interface RiskOutput {
  top_risks: Risk[];
  blind_spots: string[];              // things founder hasn't considered
  failure_modes: string[];            // specific ways this startup could die
  execution_risk_level: "low" | "medium" | "high" | "critical";
  confidence: number;
  reasoning: string;
}

export interface Risk {
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "fatal";
  mitigation: string;
}

function focusAreaLine(ctx: StartupContext): string {
  return ctx.focusAreas?.length
    ? `Founder-selected focus areas: ${ctx.focusAreas.join(", ")}. Prioritize these dimensions when deciding what to inspect, criticize, and recommend.`
    : "Founder-selected focus areas: none.";
}

// ── Pipeline output ───────────────────────────────────────────────────────────

export interface AgentPipelineResult {
  market: MarketResearchOutput | null;
  competitor: CompetitorOutput | null;
  trend: TrendOutput | null;
  sentiment: SentimentOutput | null;
  risk: RiskOutput | null;
  // Merged signal summary for scoring engine
  signal_summary: SignalSummary;
  // Which agents succeeded/failed
  agent_statuses: Record<AgentName, "success" | "failed" | "fallback">;
  // How long the pipeline took
  duration_ms: number;
}

export type AgentName = "market" | "competitor" | "trend" | "sentiment" | "risk";

export interface SignalSummary {
  // Distilled inputs for the scoring engine
  demand_score: number;           // 0–100
  competition_score: number;      // 0–100 (higher = more competitive = harder)
  timing_score: number;           // 0–100 (higher = better timing)
  uniqueness_score: number;       // 0–100
  risk_score: number;             // 0–100 (higher = more risky)
  overall_confidence: number;     // 0–1 (average across agents)
  // Aggregated lists for report generation
  all_risks: Risk[];
  all_opportunities: string[];
  all_pain_points: string[];
  competitor_gaps: string[];
}

// ─── Agent 1: Market Research ─────────────────────────────────────────────────

async function runMarketResearchAgent(ctx: StartupContext): Promise<MarketResearchOutput> {
  const system = `You are a specialist Market Research Agent in a startup validation pipeline.
Your ONLY job: assess genuine market demand for this startup idea.

Return ONLY valid JSON matching this exact shape:
{
  "market_size_signal": "niche" | "mid" | "large" | "unknown",
  "demand_authenticity": "real" | "manufactured" | "uncertain",
  "growth_trajectory": "growing" | "flat" | "declining" | "unknown",
  "demand_signals": ["concrete evidence string 1", "..."],
  "demand_gaps": ["underserved segment or need 1", "..."],
  "target_customer_fit": "one sentence on fit between idea and target users",
  "confidence": 0.0–1.0,
  "reasoning": "your internal reasoning chain (2-3 sentences)"
}

Rules:
- demand_signals must be SPECIFIC. Not "there is demand". Name the signal.
- If you are uncertain, lower confidence. Never fabricate statistics.
- demand_gaps: where are real users underserved RIGHT NOW?
- market_size_signal: niche = <$100M TAM, mid = $100M–$1B, large = $1B+
- confidence reflects how much real evidence you have vs inference`;

  const competitorContext = ctx.competitors.length > 0
    ? `\nScraped competitor data:\n${ctx.competitors.map((c, i) => `${i + 1}. ${c.title} — ${c.url}\n   ${c.snippet}`).join("\n")}`
    : "\nNo scraped competitor data available.";

  const user = `Startup idea: ${ctx.idea}
Problem: ${ctx.problem}
Target users: ${ctx.targetUsers}
Solution: ${ctx.solution}
Stage: ${ctx.stage}
${focusAreaLine(ctx)}
${competitorContext}

Assess market demand. Be specific. Lower confidence when uncertain.`;

  const fallback: MarketResearchOutput = {
    market_size_signal: "unknown",
    demand_authenticity: "uncertain",
    growth_trajectory: "unknown",
    demand_signals: ["Insufficient data to confirm demand — founder needs to run user interviews"],
    demand_gaps: ["Gap analysis requires more market research"],
    target_customer_fit: "Target customer fit is unverified — needs direct user validation",
    confidence: 0.3,
    reasoning: "Market research agent fell back to defaults due to insufficient context.",
  };

  try {
    const result = await callModelJSON<MarketResearchOutput>(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { role: "fast", maxTokens: 700 },
    );
    // Validate required fields
    if (!result.demand_signals || !result.confidence) return fallback;
    return {
      ...fallback,
      ...result,
      confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0.3)),
    };
  } catch {
    return fallback;
  }
}

// ─── Agent 2: Competitor Analysis ────────────────────────────────────────────

async function runCompetitorAgent(ctx: StartupContext): Promise<CompetitorOutput> {
  const system = `You are a specialist Competitor Analysis Agent in a startup validation pipeline.
Your ONLY job: map the competitive landscape and find exploitable gaps.

Return ONLY valid JSON matching this exact shape:
{
  "saturation_level": "low" | "medium" | "high" | "unknown",
  "direct_competitors": [
    {
      "name": "Competitor name",
      "url": "url or empty string",
      "weakness": "their specific gap this founder can exploit",
      "threat_level": "low" | "medium" | "high"
    }
  ],
  "indirect_competitors": ["alternative solution 1", "..."],
  "market_gaps": ["what NO competitor is doing well 1", "..."],
  "differentiation_opportunities": ["specific angle 1", "..."],
  "competitive_moat_score": 0–10,
  "confidence": 0.0–1.0,
  "reasoning": "2-3 sentence reasoning chain"
}

Rules:
- Use the scraped competitor data as primary evidence
- market_gaps: must be SPECIFIC to the competitors listed, not generic
- differentiation_opportunities: name a specific positioning angle, not "be better"
- competitive_moat_score: 0 = commodity, 10 = nearly impossible to replicate
- saturation: low = few direct competitors, high = crowded with funded players`;

  const competitorContext = ctx.competitors.length > 0
    ? `\nLive competitor data from web scan:\n${ctx.competitors.map((c, i) => `${i + 1}. ${c.title}\n   URL: ${c.url}\n   Context: ${c.snippet}`).join("\n\n")}`
    : "\nNo competitor data from web scan. Reason from training knowledge only — lower confidence accordingly.";

  const user = `Startup idea: ${ctx.idea}
Problem being solved: ${ctx.problem}
Target users: ${ctx.targetUsers}
Stage: ${ctx.stage}
${focusAreaLine(ctx)}
${competitorContext}

Map the competitive landscape. Name specific gaps. Be precise.`;

  const fallback: CompetitorOutput = {
    saturation_level: "unknown",
    direct_competitors: [],
    indirect_competitors: ["Manual workarounds", "Spreadsheets", "Existing tools repurposed"],
    market_gaps: ["Unable to identify specific gaps without competitor data"],
    differentiation_opportunities: ["Run a competitor scan with more specific search terms"],
    competitive_moat_score: 3,
    confidence: 0.25,
    reasoning: "Competitor agent fell back — insufficient scraped data to map landscape precisely.",
  };

  try {
    const result = await callModelJSON<CompetitorOutput>(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { role: "fast", maxTokens: 700 },
    );
    if (!result.saturation_level) return fallback;
    return {
      ...fallback,
      ...result,
      competitive_moat_score: Math.min(10, Math.max(0, Number(result.competitive_moat_score) || 3)),
      confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0.25)),
    };
  } catch {
    return fallback;
  }
}

// ─── Agent 3: Trend Detection ─────────────────────────────────────────────────

async function runTrendAgent(ctx: StartupContext): Promise<TrendOutput> {
  const system = `You are a specialist Trend Detection Agent in a startup validation pipeline.
Your ONLY job: assess timing — is this the right moment to build this?

Return ONLY valid JSON matching this exact shape:
{
  "timing_signal": "early" | "right" | "late" | "unknown",
  "macro_tailwinds": ["force working IN favour 1", "..."],
  "macro_headwinds": ["force working AGAINST 1", "..."],
  "window_of_opportunity": "specific narrative about the timing window",
  "trend_confidence": 0.0–1.0,
  "confidence": 0.0–1.0,
  "reasoning": "2-3 sentence reasoning chain"
}

Rules:
- timing_signal "early" = market not ready yet, "right" = optimal window, "late" = too crowded/declining
- macro_tailwinds: name SPECIFIC macro forces (e.g. "AI commoditisation lowering build costs", "remote work normalising async tools")
- macro_headwinds: name SPECIFIC friction forces (e.g. "incumbent with $50M war chest", "regulation tightening in this sector")
- window_of_opportunity: one concrete sentence about WHY now (or why not now)
- Lower confidence if timing is genuinely unclear`;

  const user = `Startup idea: ${ctx.idea}
Problem: ${ctx.problem}
Target users: ${ctx.targetUsers}
Stage: ${ctx.stage}
${focusAreaLine(ctx)}
Known competitors: ${ctx.competitors.map(c => c.title).join(", ") || "none found"}

Assess timing. Is this the right moment? What forces are at play?`;

  const fallback: TrendOutput = {
    timing_signal: "unknown",
    macro_tailwinds: ["AI tooling lowering cost of building", "Founder ecosystem growing globally"],
    macro_headwinds: ["Market timing unverified", "Competitive landscape unclear"],
    window_of_opportunity: "Timing assessment requires more market research to confirm.",
    trend_confidence: 0.3,
    confidence: 0.3,
    reasoning: "Trend agent fell back to defaults — insufficient signals to assess timing.",
  };

  try {
    const result = await callModelJSON<TrendOutput>(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { role: "fast", maxTokens: 700 },
    );
    if (!result.timing_signal) return fallback;
    return {
      ...fallback,
      ...result,
      trend_confidence: Math.min(1, Math.max(0, Number(result.trend_confidence) || 0.3)),
      confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0.3)),
    };
  } catch {
    return fallback;
  }
}

// ─── Agent 4: Customer Sentiment ──────────────────────────────────────────────

async function runSentimentAgent(ctx: StartupContext): Promise<SentimentOutput> {
  const system = `You are a specialist Customer Sentiment Agent in a startup validation pipeline.
Your ONLY job: assess whether real users genuinely feel the pain this startup addresses.

Return ONLY valid JSON matching this exact shape:
{
  "pain_intensity": "low" | "medium" | "high" | "unknown",
  "user_pain_points": ["real complaint or frustration 1", "..."],
  "demand_signals": ["evidence people are actively seeking solution 1", "..."],
  "community_signals": ["forum/community evidence 1", "..."],
  "willingness_to_pay_signal": "unlikely" | "possible" | "likely" | "unknown",
  "confidence": 0.0–1.0,
  "reasoning": "2-3 sentence reasoning chain"
}

Rules:
- pain_intensity "high" = users are actively complaining, losing money, or blocked
- user_pain_points: name SPECIFIC frustrations, not generic ones
- demand_signals: evidence of active search for solutions (complaints, workarounds, requests)
- community_signals: what Reddit/forums/communities reveal about this problem
- willingness_to_pay: "likely" only if there's evidence people already pay for adjacent solutions
- If you cannot confirm pain intensity from the data, say "unknown" and lower confidence`;

  const user = `Startup idea: ${ctx.idea}
Problem addressed: ${ctx.problem}
Target users: ${ctx.targetUsers}
Stage: ${ctx.stage}
${focusAreaLine(ctx)}
Competitor snippets (for sentiment inference): ${ctx.competitors.map(c => c.snippet).filter(Boolean).join(" | ") || "none"}

Assess user pain intensity and demand authenticity. Be specific.`;

  const fallback: SentimentOutput = {
    pain_intensity: "unknown",
    user_pain_points: ["Pain intensity unverified — founder needs to conduct user interviews"],
    demand_signals: ["No confirmed demand signals — go talk to 5 target users this week"],
    community_signals: ["Community research not available in this context"],
    willingness_to_pay_signal: "unknown",
    confidence: 0.2,
    reasoning: "Sentiment agent fell back — no user interview data or community signals available.",
  };

  try {
    const result = await callModelJSON<SentimentOutput>(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { role: "fast", maxTokens: 700 },
    );
    if (!result.pain_intensity) return fallback;
    return {
      ...fallback,
      ...result,
      confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0.2)),
    };
  } catch {
    return fallback;
  }
}

// ─── Agent 5: Risk Assessment ─────────────────────────────────────────────────

async function runRiskAgent(ctx: StartupContext): Promise<RiskOutput> {
  const system = `You are a specialist Risk Assessment Agent in a startup validation pipeline.
Your ONLY job: identify the real ways this startup will fail.

Return ONLY valid JSON matching this exact shape:
{
  "top_risks": [
    {
      "title": "short risk name",
      "description": "specific description of the risk",
      "severity": "low" | "medium" | "high" | "fatal",
      "mitigation": "one concrete action to reduce this risk"
    }
  ],
  "blind_spots": ["thing founder hasn't considered 1", "..."],
  "failure_modes": ["specific way this startup could die 1", "..."],
  "execution_risk_level": "low" | "medium" | "high" | "critical",
  "confidence": 0.0–1.0,
  "reasoning": "2-3 sentence reasoning chain"
}

Rules:
- top_risks: 3–5 risks, ordered by severity descending
- Each risk must be SPECIFIC to this startup, not generic startup advice
- blind_spots: things the founder description reveals they haven't thought about
- failure_modes: specific death scenarios (e.g. "Enterprise sales cycle kills runway before first contract")
- execution_risk_level based on stage + complexity + competition
- "fatal" severity = this alone could kill the company`;

  const user = `Startup idea: ${ctx.idea}
Problem: ${ctx.problem}
Target users: ${ctx.targetUsers}
Stage: ${ctx.stage}
${focusAreaLine(ctx)}
Known weaknesses: ${ctx.validationWeaknesses?.join(", ") || "none provided"}
Execution score: ${ctx.executionScore ?? "unknown"}/100

Identify the real risks. Be specific and brutal.`;

  const fallback: RiskOutput = {
    top_risks: [
      {
        title: "Unvalidated demand",
        description: "No confirmed evidence that target users will pay for this solution",
        severity: "high",
        mitigation: "Run 5 user interviews with willingness-to-pay questions this week",
      },
      {
        title: "Execution bandwidth",
        description: "Solo founder risk — no validation of capacity to execute",
        severity: "medium",
        mitigation: "Define your single most important milestone for the next 30 days",
      },
    ],
    blind_spots: ["Distribution strategy not defined", "Unit economics not modelled"],
    failure_modes: ["Building without validating demand first", "Running out of runway before first paying customer"],
    execution_risk_level: "high",
    confidence: 0.4,
    reasoning: "Risk agent used default high-risk assessment — insufficient project data to refine.",
  };

  try {
    const result = await callModelJSON<RiskOutput>(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { role: "reasoning", maxTokens: 800 },
    );
    if (!result.top_risks || !Array.isArray(result.top_risks)) return fallback;
    return {
      ...fallback,
      ...result,
      confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0.4)),
    };
  } catch {
    return fallback;
  }
}

// ─── Signal Merger ────────────────────────────────────────────────────────────

/**
 * mergeSignals — converts 5 agent outputs into a unified SignalSummary
 * used by the scoring engine and report generator.
 */
function mergeSignals(
  market: MarketResearchOutput | null,
  competitor: CompetitorOutput | null,
  trend: TrendOutput | null,
  sentiment: SentimentOutput | null,
  risk: RiskOutput | null,
): SignalSummary {
  // ── Demand score (0–100) ──
  const demandMap = { real: 80, manufactured: 30, uncertain: 45 };
  const painMap = { high: 85, medium: 55, low: 25, unknown: 35 };
  const wtpMap = { likely: 85, possible: 55, unlikely: 20, unknown: 35 };
  const demandBase = market ? demandMap[market.demand_authenticity] ?? 45 : 45;
  const painBonus = sentiment ? painMap[sentiment.pain_intensity] ?? 35 : 35;
  const wtpBonus = sentiment ? wtpMap[sentiment.willingness_to_pay_signal] ?? 35 : 35;
  const demand_score = Math.round((demandBase * 0.4) + (painBonus * 0.35) + (wtpBonus * 0.25));

  // ── Competition score (0–100, higher = more competitive = harder) ──
  const satMap = { high: 80, medium: 50, low: 20, unknown: 45 };
  const competition_score = competitor ? satMap[competitor.saturation_level] ?? 45 : 45;

  // ── Timing score (0–100, higher = better timing) ──
  const timingMap = { right: 80, early: 55, late: 25, unknown: 40 };
  const timing_score = trend ? timingMap[trend.timing_signal] ?? 40 : 40;

  // ── Uniqueness score (0–100) ──
  const moatBase = competitor ? Math.round((competitor.competitive_moat_score / 10) * 60) : 30;
  const gapBonus = competitor ? Math.min(40, (competitor.market_gaps?.length ?? 0) * 8) : 10;
  const uniqueness_score = Math.min(100, moatBase + gapBonus);

  // ── Risk score (0–100, higher = more risky) ──
  const riskLevelMap = { critical: 90, high: 70, medium: 45, low: 20 };
  const fatalRisks = risk?.top_risks?.filter(r => r.severity === "fatal").length ?? 0;
  const highRisks = risk?.top_risks?.filter(r => r.severity === "high").length ?? 0;
  const riskBase = risk ? riskLevelMap[risk.execution_risk_level] ?? 70 : 70;
  const riskPenalty = Math.min(20, fatalRisks * 10 + highRisks * 4);
  const risk_score = Math.min(100, riskBase + riskPenalty);

  // ── Overall confidence ──
  const confidences = [market, competitor, trend, sentiment, risk]
    .filter(Boolean)
    .map(a => a!.confidence);
  const overall_confidence = confidences.length > 0
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
    : 0.3;

  // ── Aggregated lists ──
  const all_risks: Risk[] = risk?.top_risks ?? [];
  const all_opportunities: string[] = [
    ...(competitor?.differentiation_opportunities ?? []),
    ...(market?.demand_gaps ?? []),
    ...(trend?.macro_tailwinds ?? []),
  ].filter(Boolean).slice(0, 8);

  const all_pain_points: string[] = [
    ...(sentiment?.user_pain_points ?? []),
    ...(sentiment?.demand_signals ?? []),
  ].filter(Boolean).slice(0, 6);

  const competitor_gaps: string[] = competitor?.market_gaps ?? [];

  return {
    demand_score,
    competition_score,
    timing_score,
    uniqueness_score,
    risk_score,
    overall_confidence,
    all_risks,
    all_opportunities,
    all_pain_points,
    competitor_gaps,
  };
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

/**
 * runAgentPipeline — executes all 5 agents in parallel.
 *
 * Uses Promise.allSettled so one agent failing doesn't kill the whole pipeline.
 * Failed agents fall back to their typed defaults.
 * Returns AgentPipelineResult with all outputs + merged SignalSummary.
 */
export async function runAgentPipeline(ctx: StartupContext): Promise<AgentPipelineResult> {
  const start = Date.now();

  const [marketResult, competitorResult, trendResult, sentimentResult, riskResult] =
    await Promise.allSettled([
      runMarketResearchAgent(ctx),
      runCompetitorAgent(ctx),
      runTrendAgent(ctx),
      runSentimentAgent(ctx),
      runRiskAgent(ctx),
    ]);

  const market = marketResult.status === "fulfilled" ? marketResult.value : null;
  const competitor = competitorResult.status === "fulfilled" ? competitorResult.value : null;
  const trend = trendResult.status === "fulfilled" ? trendResult.value : null;
  const sentiment = sentimentResult.status === "fulfilled" ? sentimentResult.value : null;
  const risk = riskResult.status === "fulfilled" ? riskResult.value : null;

  const agent_statuses: Record<AgentName, "success" | "failed" | "fallback"> = {
    market: marketResult.status === "fulfilled"
      ? (market!.confidence > 0.3 ? "success" : "fallback")
      : "failed",
    competitor: competitorResult.status === "fulfilled"
      ? (competitor!.confidence > 0.25 ? "success" : "fallback")
      : "failed",
    trend: trendResult.status === "fulfilled"
      ? (trend!.confidence > 0.3 ? "success" : "fallback")
      : "failed",
    sentiment: sentimentResult.status === "fulfilled"
      ? (sentiment!.confidence > 0.2 ? "success" : "fallback")
      : "failed",
    risk: riskResult.status === "fulfilled"
      ? (risk!.confidence > 0.3 ? "success" : "fallback")
      : "failed",
  };

  const signal_summary = mergeSignals(market, competitor, trend, sentiment, risk);

  return {
    market,
    competitor,
    trend,
    sentiment,
    risk,
    signal_summary,
    agent_statuses,
    duration_ms: Date.now() - start,
  };
}

// ─── Input Parser ─────────────────────────────────────────────────────────────

/**
 * Parsed schema from free-text startup idea.
 * Used by validate-idea route before running the agent pipeline.
 */
export interface ParsedStartupSchema {
  problem: string;
  target_customer: string;
  solution: string;
  value_proposition: string;
  monetization: string;
  category: string;
}

/**
 * parseStartupIdea — converts free-text idea into structured schema.
 * Single Groq call, fast, used as Stage 0 before pipeline runs.
 */
export async function parseStartupIdea(rawIdea: string): Promise<ParsedStartupSchema> {
  if (!process.env.GROQ_API_KEY) {
    return {
      problem: rawIdea,
      target_customer: "Not specified",
      solution: rawIdea,
      value_proposition: "Not specified",
      monetization: "Not specified",
      category: "Not specified",
    };
  }

  const system = `You are a startup idea parser. Convert a free-text startup description into a structured schema.
Return ONLY valid JSON with exactly these keys:
{
  "problem": "the core problem being solved (1-2 sentences)",
  "target_customer": "specific customer segment (be specific, not 'businesses')",
  "solution": "the proposed solution (1-2 sentences)",
  "value_proposition": "why this is better than existing alternatives (1 sentence)",
  "monetization": "how this makes money (be specific: subscription, per-seat, transaction fee, etc.)",
  "category": "market category (e.g. B2B SaaS, Consumer App, Marketplace, Developer Tools, etc.)"
}
If a field cannot be inferred from the text, write "Not specified" — do not invent.`;

  try {
    const result = await callModelJSON<ParsedStartupSchema>(
      [{ role: "system", content: system }, { role: "user", content: `Startup idea: "${rawIdea}"` }],
      { role: "fast", maxTokens: 400 },
    );
    return {
      problem: result.problem || rawIdea,
      target_customer: result.target_customer || "Not specified",
      solution: result.solution || rawIdea,
      value_proposition: result.value_proposition || "Not specified",
      monetization: result.monetization || "Not specified",
      category: result.category || "Not specified",
    };
  } catch {
    return {
      problem: rawIdea,
      target_customer: "Not specified",
      solution: rawIdea,
      value_proposition: "Not specified",
      monetization: "Not specified",
      category: "Not specified",
    };
  }
}

// ─── Pivot Engine ─────────────────────────────────────────────────────────────

export interface PivotSuggestion {
  title: string;
  description: string;
  target_niche: string;
  why_better: string;
  estimated_score_delta: number;  // how much this pivot improves viability score
  key_change: string;             // the single most important thing that changes
}

/**
 * generatePivots — produces 3 scored pivot suggestions based on agent signals.
 * Each pivot targets a clearer niche and justifies why it improves viability.
 */
export async function generatePivots(
  ctx: StartupContext,
  signals: SignalSummary,
  currentScore: number,
): Promise<PivotSuggestion[]> {
  const fallbackPivots: PivotSuggestion[] = [
    {
      title: "Niche down to one user segment",
      description: "Instead of targeting all users, focus exclusively on the highest-pain segment",
      target_niche: "Power users with acute pain",
      why_better: "Niche products have higher conversion and word-of-mouth",
      estimated_score_delta: 8,
      key_change: "Target audience definition",
    },
    {
      title: "B2B pivot",
      description: "Sell to businesses rather than individual consumers",
      target_niche: "Small businesses in target sector",
      why_better: "B2B has clearer willingness-to-pay and longer retention",
      estimated_score_delta: 6,
      key_change: "Monetization model",
    },
    {
      title: "Services-first validation",
      description: "Offer the solution as a done-for-you service before building product",
      target_niche: "Early adopters willing to pay for outcome",
      why_better: "Validates willingness-to-pay before engineering investment",
      estimated_score_delta: 10,
      key_change: "Go-to-market approach",
    },
  ];

  if (!process.env.GROQ_API_KEY) return fallbackPivots;

  const system = `You are a Pivot Engine in a startup validation system.
Generate exactly 3 improved pivot variations of this startup idea.
Each pivot must: target a clearer niche, improve viability, and justify why.

Return ONLY valid JSON:
{
  "pivots": [
    {
      "title": "short pivot name",
      "description": "what changes in this pivot (2 sentences)",
      "target_niche": "specific niche this pivot targets",
      "why_better": "specific reason this scores higher (reference the signals)",
      "estimated_score_delta": 5–20,
      "key_change": "the single most important thing that changes"
    }
  ]
}

Rules:
- Each pivot must be MEANINGFULLY different from each other
- estimated_score_delta: honest estimate of improvement, not inflated
- Reference actual gaps and pain points from the signal data
- Do not suggest "add more features" as a pivot`;

  const user = `Current startup: ${ctx.idea}
Problem: ${ctx.problem}
Target users: ${ctx.targetUsers}
Current viability score: ${currentScore}/100
${focusAreaLine(ctx)}

Signal data:
- Demand score: ${signals.demand_score}/100
- Competition score: ${signals.competition_score}/100 (higher = harder)
- Timing score: ${signals.timing_score}/100
- Uniqueness score: ${signals.uniqueness_score}/100
- Key gaps identified: ${signals.competitor_gaps.slice(0, 3).join(", ") || "none"}
- Key pain points: ${signals.all_pain_points.slice(0, 3).join(", ") || "none"}

Generate 3 pivots that improve on the weakest signals.`;

  try {
    const result = await callModelJSON<{ pivots: PivotSuggestion[] }>(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { role: "fast", maxTokens: 700 },
    );
    if (!result.pivots || result.pivots.length < 3) return fallbackPivots;
    return result.pivots.slice(0, 3).map(p => ({
      title: p.title || "Pivot",
      description: p.description || "",
      target_niche: p.target_niche || "Not specified",
      why_better: p.why_better || "Addresses key signal gaps",
      estimated_score_delta: Math.min(25, Math.max(3, Number(p.estimated_score_delta) || 5)),
      key_change: p.key_change || "Strategy",
    }));
  } catch {
    return fallbackPivots;
  }
}
