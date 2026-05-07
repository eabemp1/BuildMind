import { beforeEach, describe, expect, it, vi } from "vitest";
import { runFullReflexionPipeline, runReflexionLoop, type ReflexionContext } from "@/lib/reflexion";
import { callModel, callModelJSON } from "@/lib/ai-providers";

vi.mock("@/lib/ai-providers", () => ({
  callModel: vi.fn(),
  callModelJSON: vi.fn(),
}));

const mockedCallModel = vi.mocked(callModel);
const mockedCallModelJSON = vi.mocked(callModelJSON);

function makeCtx(overrides: Partial<ReflexionContext> = {}): ReflexionContext {
  return {
    startupSummary: "A lightweight CRM for solo founders",
    stage: "MVP",
    momentumScore: 64,
    targetUsers: "solo founders",
    domainDataPoints: 8,
    ...overrides,
  };
}

function makePipelineInput() {
  const agentPipeline = {
    duration_ms: 1200,
    signal_summary: {
      demand_score: 68,
      competition_score: 42,
      timing_score: 70,
      uniqueness_score: 61,
      risk_score: 35,
      overall_confidence: 0.72,
      all_pain_points: ["Founders lose follow-up context after calls"],
      competitor_gaps: ["Existing CRMs are too heavy for solo operators"],
      all_opportunities: ["Own the lightweight follow-up workflow"],
      all_risks: [{ title: "Weak willingness-to-pay", description: "Pricing is not validated", severity: "medium" }],
    },
    market: { demand_signals: ["Repeated complaints about manual follow-up"] },
    competitor: { differentiation_opportunities: ["Position around founder speed"] },
    trend: { window_of_opportunity: "AI-native workflows are becoming expected" },
    sentiment: {},
    risk: { top_risks: [{ title: "Pricing risk" }] },
    agent_statuses: [],
  } as any;

  const viabilityScore = {
    viability_score: 66,
    verdict: "promising",
    verdict_reason: "Demand exists but pricing needs proof",
    confidence: 0.7,
    breakdown: {},
  } as any;

  return {
    founderContext: makeCtx(),
    agentPipeline,
    viabilityScore,
    task: "Find the single highest-leverage next action.",
  };
}

describe("reflexion pipeline integration fallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults Stage 4 critic to pass when critic JSON parsing fails", async () => {
    mockedCallModel
      .mockResolvedValueOnce("Message 3 solo founders on LinkedIn about their follow-up workflow.")
      .mockResolvedValueOnce("Message 3 solo founders on LinkedIn today and ask where follow-ups break.")
      .mockResolvedValueOnce("Because MVP traction depends on proving repeated follow-up pain.");
    mockedCallModelJSON.mockRejectedValueOnce(new Error("JSON_PARSE: Unexpected token"));

    const result = await runReflexionLoop("Pick today's task", makeCtx());

    expect(result.verdict).toBe("pass");
    expect(result.critique).toContain("Verdict parsing failed");
    expect(result.output).toContain("Message 3 solo founders");
  });

  it("uses the verifier fallback when Stage 5 verification times out", async () => {
    mockedCallModel
      .mockResolvedValueOnce("Message 5 solo founders on LinkedIn about CRM follow-up pain.")
      .mockResolvedValueOnce("Message 5 solo founders on LinkedIn today; ask what they forgot after their last sales call.")
      .mockResolvedValueOnce("Because demand is visible but willingness-to-pay is still unproven.");
    mockedCallModelJSON
      .mockResolvedValueOnce({
        verdict: "pass",
        primary_flaw: "No fatal flaw",
        specific_critique: "Specific enough to test demand.",
        improved_version: null,
      } as any)
      .mockRejectedValueOnce(new Error("AbortError: timeout"));

    const result = await runFullReflexionPipeline(makePipelineInput());

    expect(result.confidence).toBe(0.4);
    expect(result._pipeline.stage5_verifier.verdict).toBe("partial");
    expect(result.supporting_signals).toContain("Action is stage-appropriate");
  });

  it("returns a meaningful fallback output when no AI provider succeeds", async () => {
    mockedCallModel.mockRejectedValue(new Error("No AI providers configured"));
    mockedCallModelJSON.mockRejectedValue(new Error("No AI providers configured"));

    const result = await runFullReflexionPipeline(makePipelineInput());

    expect(result.action).toContain("Unable to generate action");
    expect(result.rationale).toContain("MVP");
    expect(result._pipeline.stage4_critique).toContain("Critique unavailable");
    expect(result._pipeline.stage5_verifier.verdict).toBe("partial");
  });
});
