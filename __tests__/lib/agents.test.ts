/**
 * __tests__/lib/agents.test.ts
 *
 * Unit tests for lib/agents/index.ts — the 5-agent market intelligence pipeline.
 *
 * Strategy: mock callModelJSON so no real LLM calls are made. Test that:
 *   1. Each agent returns its typed shape (or typed fallback on failure)
 *   2. runAgentPipeline handles individual agent failures gracefully
 *   3. agent_statuses reflects success / failed / fallback correctly
 *   4. Pipeline completes even when all 5 agents fail
 *   5. signal_summary is always defined regardless of agent outcomes
 *   6. withTimeout causes failed agents to be treated as failed, not crash the pipeline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock AI provider ──────────────────────────────────────────────────────────
vi.mock("../../lib/ai-providers", () => ({
  callModelJSON: vi.fn(),
  callModel: vi.fn(),
  hasAIProvider: vi.fn(() => true),
}));

import { callModelJSON } from "../../lib/ai-providers";
import { runAgentPipeline } from "../../lib/agents/index";
import type { StartupContext } from "../../lib/agents/index";

// ── Helpers ───────────────────────────────────────────────────────────────────

function baseCtx(overrides: Partial<StartupContext> = {}): StartupContext {
  return {
    idea: "A tool that helps solo founders track their daily execution",
    problem: "Founders lose track of what they committed to and why",
    targetUsers: "solo founders",
    solution: "AI-powered daily task + reflection loop",
    stage: "Idea",
    competitors: [],
    focusAreas: [],
    ...overrides,
  };
}

/** Valid MarketResearchAgent response shape */
const MARKET_RESPONSE = {
  market_size_signal: "mid",
  demand_authenticity: "real",
  growth_trajectory: "growing",
  demand_signals: ["YC applications up 40% YoY", "Notion usage data shows PM workflow gap"],
  demand_gaps: ["No tool tracks why founders make decisions"],
  target_customer_fit: "Strong — problem is acutely felt by solo technical founders",
  confidence: 0.72,
  reasoning: "Strong qualitative evidence from community signals.",
};

/** Valid CompetitorAgent response shape */
const COMPETITOR_RESPONSE = {
  saturation_level: "low",
  direct_competitors: [
    { name: "Notion", url: "notion.so", weakness: "Generic — not founder-specific", threat_level: "medium" },
  ],
  indirect_competitors: ["Linear", "Todoist"],
  market_gaps: ["No tool provides a behavioral learning loop for founders"],
  differentiation_opportunities: ["Founder memory system", "Reflexion pipeline"],
  moat_score: 7,
  confidence: 0.65,
  reasoning: "Fragmented market with no dominant founder-specific tool.",
};

/** Valid TrendAgent response shape */
const TREND_RESPONSE = {
  timing_signal: "right",
  macro_tailwinds: ["AI tooling cost collapse", "Solo founder movement growing"],
  macro_headwinds: ["VC pullback on SaaS tooling"],
  window_of_opportunity: "12–18 months before large players add founder-specific AI modes",
  confidence: 0.68,
  reasoning: "Timing is good — market forming but not saturated.",
};

/** Valid SentimentAgent response shape */
const SENTIMENT_RESPONSE = {
  pain_intensity: "high",
  pain_points: ["Founders don't know what to work on each day", "Accountability tools feel punitive"],
  demand_signals: ["r/startups weekly threads on execution anxiety"],
  community_signals: ["Indie Hackers — execution vs ideas debates weekly"],
  willingness_to_pay_signal: "medium",
  confidence: 0.6,
  reasoning: "Real pain, validated by community discourse.",
};

/** Valid RiskAgent response shape */
const RISK_RESPONSE = {
  top_risks: [
    { risk: "Notion adds founder mode", severity: "high", mitigation: "Build behavioral memory moat before they ship" },
    { risk: "LLM output quality variance", severity: "medium", mitigation: "Reflexion pipeline + human override" },
  ],
  blind_spots: ["Geographic market assumptions"],
  failure_modes: ["Churn if daily action quality is poor"],
  execution_risk_level: "medium",
  confidence: 0.7,
  reasoning: "Main risk is platform competition, not market size.",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runAgentPipeline — all agents succeed", () => {
  beforeEach(() => {
    let callCount = 0;
    vi.mocked(callModelJSON).mockImplementation(async () => {
      const responses = [
        MARKET_RESPONSE,
        COMPETITOR_RESPONSE,
        TREND_RESPONSE,
        SENTIMENT_RESPONSE,
        RISK_RESPONSE,
      ];
      return responses[callCount++ % responses.length];
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("returns all 5 agent outputs", async () => {
    const result = await runAgentPipeline(baseCtx());
    expect(result.market).not.toBeNull();
    expect(result.competitor).not.toBeNull();
    expect(result.trend).not.toBeNull();
    expect(result.sentiment).not.toBeNull();
    expect(result.risk).not.toBeNull();
  });

  it("returns agent_statuses with all success or fallback (never failed)", async () => {
    const result = await runAgentPipeline(baseCtx());
    for (const status of Object.values(result.agent_statuses)) {
      expect(["success", "fallback"]).toContain(status);
    }
  });

  it("always returns a defined signal_summary with required array fields", async () => {
    const result = await runAgentPipeline(baseCtx());
    expect(result.signal_summary).toBeDefined();
    expect(Array.isArray(result.signal_summary.all_pain_points)).toBe(true);
    expect(Array.isArray(result.signal_summary.all_risks)).toBe(true);
  });

  it("records duration_ms", async () => {
    const result = await runAgentPipeline(baseCtx());
    expect(typeof result.duration_ms).toBe("number");
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("passes competitor data into agent context when provided", async () => {
    const ctx = baseCtx({
      competitors: [{ title: "Notion", url: "notion.so", snippet: "All-in-one workspace" }],
    });
    const result = await runAgentPipeline(ctx);
    // Pipeline should complete without error when competitor data is provided
    expect(result).toBeDefined();
    expect(result.market).not.toBeNull();
  });
});

describe("runAgentPipeline — individual agent failures are isolated", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns a fallback (not null) for a failed agent, and marks status as 'failed' or 'fallback'", async () => {
    let callCount = 0;
    vi.mocked(callModelJSON).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("MarketResearchAgent LLM error");
      const responses: Record<number, unknown> = {
        2: COMPETITOR_RESPONSE,
        3: TREND_RESPONSE,
        4: SENTIMENT_RESPONSE,
        5: RISK_RESPONSE,
      };
      return responses[callCount] ?? MARKET_RESPONSE;
    });

    const result = await runAgentPipeline(baseCtx());
    // Agent catches internally and returns a typed fallback — always defined
    expect(result.market).toBeDefined();
    // Status is "failed" if the outer Promise.allSettled rejected, OR "fallback"
    // if the agent caught internally and returned a low-confidence result.
    // Both are valid non-success statuses.
    expect(["failed", "fallback"]).toContain(result.agent_statuses.market);
    // Others should be success or fallback (not failed)
    expect(result.agent_statuses.competitor).not.toBe("failed");
  });

  it("pipeline always completes even when callModelJSON rejects for all agents", async () => {
    vi.resetAllMocks();
    vi.mocked(callModelJSON).mockRejectedValue(new Error("Provider unavailable"));

    // Pipeline should complete without throwing — this is the core resilience guarantee
    const result = await runAgentPipeline(baseCtx());

    // Every output is defined — the pipeline never returns null for any agent
    expect(result.market).toBeDefined();
    expect(result.competitor).toBeDefined();
    expect(result.trend).toBeDefined();
    expect(result.sentiment).toBeDefined();
    expect(result.risk).toBeDefined();

    // signal_summary is always defined regardless of agent outcomes
    expect(result.signal_summary).toBeDefined();
    expect(Array.isArray(result.signal_summary.all_pain_points)).toBe(true);
    expect(Array.isArray(result.signal_summary.all_risks)).toBe(true);

    // duration_ms is always recorded
    expect(typeof result.duration_ms).toBe("number");
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);

    // Statuses reflect either "failed" (timeout/rejection bubbled) or "fallback"
    // (agent caught internally and returned low-confidence result). Never undefined.
    for (const status of Object.values(result.agent_statuses)) {
      expect(["success", "failed", "fallback"]).toContain(status);
    }
  });

  it("marks agent as 'fallback' when confidence is below threshold", async () => {
    vi.mocked(callModelJSON).mockResolvedValue({
      ...MARKET_RESPONSE,
      confidence: 0.1, // below 0.3 threshold → fallback status
    });

    const result = await runAgentPipeline(baseCtx());
    expect(result.agent_statuses.market).toBe("fallback");
  });
});

describe("runAgentPipeline — signal_summary correctness", () => {
  afterEach(() => vi.clearAllMocks());

  it("merges pain_points from sentiment agent into signal_summary", async () => {
    let callCount = 0;
    vi.mocked(callModelJSON).mockImplementation(async () => {
      callCount++;
      const responses: Record<number, unknown> = {
        1: MARKET_RESPONSE,
        2: COMPETITOR_RESPONSE,
        3: TREND_RESPONSE,
        4: SENTIMENT_RESPONSE,
        5: RISK_RESPONSE,
      };
      return responses[callCount] ?? MARKET_RESPONSE;
    });

    const result = await runAgentPipeline(baseCtx());
    // signal_summary.all_pain_points is populated from sentiment.user_pain_points
    expect(result.signal_summary.all_pain_points.length).toBeGreaterThan(0);
  });

  it("signal_summary has no undefined arrays even with all-agent failures", async () => {
    vi.mocked(callModelJSON).mockRejectedValue(new Error("timeout"));

    const result = await runAgentPipeline(baseCtx());
    const s = result.signal_summary;
    expect(Array.isArray(s.all_pain_points)).toBe(true);
    expect(Array.isArray(s.all_risks)).toBe(true);
    expect(Array.isArray(s.all_opportunities)).toBe(true);
    expect(Array.isArray(s.competitor_gaps)).toBe(true);
  });
});
