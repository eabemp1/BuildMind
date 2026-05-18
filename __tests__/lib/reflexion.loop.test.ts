/**
 * __tests__/lib/reflexion.loop.test.ts
 *
 * Unit tests for runReflexionLoop — the 3-agent chain (Generator → Critic → Refiner)
 * that powers the Today page action. All AI calls are mocked so tests run offline
 * in ~50ms and never consume Groq quota.
 *
 * Coverage:
 *   - Happy path: passes through Generator → Critic (pass) → Refiner
 *   - Critic rejects and Refiner uses improved_version
 *   - Confidence gate fires when domainDataPoints < 5
 *   - Emotional language layer injected at correct triggers
 *   - Entire chain survives when all AI calls throw
 *   - Output is stripped of <think>...</think> blocks (gpt-oss artefact)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  runReflexionLoop,
  type ReflexionContext,
  type EmotionalTrigger,
} from "@/lib/reflexion";
import { callModel, callModelJSON } from "@/lib/ai-providers";

vi.mock("@/lib/ai-providers", () => ({
  callModel: vi.fn(),
  callModelJSON: vi.fn(),
  hasAIProvider: vi.fn(() => true),
}));

// Silence logError during tests — prevents console.error output from confusing
// vitest's unhandled-rejection detector when callModel is mocked to reject.
vi.mock("@/lib/server/logger", () => ({
  logError: vi.fn(),
  logWarn:  vi.fn(),
  logInfo:  vi.fn(),
}));

const mockedCallModel    = vi.mocked(callModel);
const mockedCallModelJSON = vi.mocked(callModelJSON);

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<ReflexionContext> = {}): ReflexionContext {
  return {
    startupSummary: "AI-powered cold outreach tool for B2B SaaS founders",
    stage: "MVP",
    momentumScore: 55,
    targetUsers: "B2B SaaS founders",
    domainDataPoints: 10,
    ...overrides,
  };
}

/** Set up standard 3-call happy-path mock: Generator → Critic (pass) → Refiner → Rationale */
function mockHappyPath(overrides: {
  generated?: string;
  criticVerdict?: "pass" | "fail";
  improvedVersion?: string | null;
  refined?: string;
  rationale?: string;
} = {}) {
  const generated = overrides.generated ?? "Message 3 B2B SaaS founders on LinkedIn today — ask about their biggest outreach friction.";
  const refined   = overrides.refined   ?? "DM 3 B2B SaaS founders on LinkedIn today: ask what breaks in their cold outreach, not about your tool.";
  const rationale = overrides.rationale ?? "Because MVP traction comes from understanding friction, not pitching features.";

  mockedCallModel
    .mockResolvedValueOnce(generated)  // Agent A
    .mockResolvedValueOnce(refined)    // Agent C
    .mockResolvedValueOnce(rationale); // Rationale

  mockedCallModelJSON.mockResolvedValueOnce({
    verdict: overrides.criticVerdict ?? "pass",
    primary_flaw: "None",
    specific_critique: "Action is specific enough.",
    improved_version: overrides.improvedVersion ?? null,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("runReflexionLoop — happy path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns output from Agent C (Refiner) when critic passes", async () => {
    mockHappyPath();
    const result = await runReflexionLoop("Pick today's task", makeCtx());

    expect(result.output).toContain("DM 3 B2B SaaS founders");
    expect(result.verdict).toBe("pass");
    expect(result.rationale).toBeTruthy();
  });

  it("makes exactly 3 callModel calls and 1 callModelJSON call on a clean pass", async () => {
    mockHappyPath();
    await runReflexionLoop("Pick today's task", makeCtx());

    expect(mockedCallModel).toHaveBeenCalledTimes(3);
    expect(mockedCallModelJSON).toHaveBeenCalledTimes(1);
  });

  it("passes stage and targetUsers into the Generator prompt", async () => {
    mockHappyPath();
    await runReflexionLoop("Pick today's task", makeCtx({ stage: "Launch", targetUsers: "indie hackers" }));

    const generatorCall = mockedCallModel.mock.calls[0];
    const systemPrompt  = generatorCall[0][0].content as string;
    expect(systemPrompt).toContain("Launch");
    expect(systemPrompt).toContain("indie hackers");
  });

  it("routes all calls through the reasoning role", async () => {
    mockHappyPath();
    await runReflexionLoop("Pick today's task", makeCtx());

    for (const call of mockedCallModel.mock.calls) {
      expect(call[1]?.role).toBe("reasoning");
    }
    expect(mockedCallModelJSON.mock.calls[0][1]?.role).toBe("reasoning");
  });
});

describe("runReflexionLoop — critic rejection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses improved_version from critic when verdict is fail", async () => {
    mockHappyPath({
      criticVerdict:  "fail",
      improvedVersion: "Send 5 personalised LinkedIn DMs to B2B SaaS founders — ask about their last failed outreach attempt.",
      refined: "Send 5 LinkedIn DMs to B2B SaaS founders today — ask what made their last cold sequence fail.",
    });

    const result = await runReflexionLoop("Pick today's task", makeCtx());

    // Refiner should have received the improved_version as seed, not raw generated
    const refinerCall = mockedCallModel.mock.calls[1];
    const refinerSystem = refinerCall[0][0].content as string;
    expect(refinerSystem).toContain("Send 5 personalised LinkedIn DMs");
  });

  it("still returns output when critic fails but improved_version is null", async () => {
    mockHappyPath({ criticVerdict: "fail", improvedVersion: null });
    const result = await runReflexionLoop("Pick today's task", makeCtx());

    expect(result.output).toBeTruthy();
    expect(result.verdict).toBe("fail");
  });
});

describe("runReflexionLoop — confidence gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns confidence gate response when domainDataPoints < 5", async () => {
    const result = await runReflexionLoop("Pick today's task", makeCtx({ domainDataPoints: 3 }));

    expect(result.output).toContain("enough context");
    // No AI calls should be made — gate fires before Generator
    expect(mockedCallModel).not.toHaveBeenCalled();
    expect(mockedCallModelJSON).not.toHaveBeenCalled();
  });

  it("does NOT fire when domainDataPoints === 5", async () => {
    mockHappyPath();
    await runReflexionLoop("Pick today's task", makeCtx({ domainDataPoints: 5 }));
    expect(mockedCallModel).toHaveBeenCalled();
  });
});

describe("runReflexionLoop — emotional language layer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("injects inactive_3plus_days instruction when daysInactive >= 3", async () => {
    mockHappyPath();
    await runReflexionLoop("Pick today's task", makeCtx({ daysInactive: 4 }));

    const refinerCall   = mockedCallModel.mock.calls[1];
    const refinerSystem = refinerCall[0][0].content as string;
    expect(refinerSystem).toContain("last week was rough");
  });

  it("injects two_tasks_in_row instruction when consecutiveTasksCompleted >= 2", async () => {
    mockHappyPath();
    await runReflexionLoop("Pick today's task", makeCtx({ consecutiveTasksCompleted: 2 }));

    const refinerCall   = mockedCallModel.mock.calls[1];
    const refinerSystem = refinerCall[0][0].content as string;
    expect(refinerSystem).toContain("two in a row");
  });

  it("does not inject emotional instruction when no trigger fires", async () => {
    mockHappyPath();
    await runReflexionLoop("Pick today's task", makeCtx({ daysInactive: 0, consecutiveTasksCompleted: 0, momentumScore: 70 }));

    const refinerCall   = mockedCallModel.mock.calls[1];
    const refinerSystem = refinerCall[0][0].content as string;
    expect(refinerSystem).not.toContain("last week was rough");
    expect(refinerSystem).not.toContain("two in a row");
  });
});

describe("runReflexionLoop — resilience", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a result even when all callModel calls throw", async () => {
    // Use an async function that awaits a microtask before rejecting.
    // This ensures the .catch() handlers in reflexion.ts are attached before
    // the rejection fires — preventing vitest from seeing an unhandled rejection.
    const deferred = async () => {
      await Promise.resolve(); // yield to allow .catch() attachment
      throw new Error("All providers exhausted");
    };
    mockedCallModel.mockImplementation(deferred);
    mockedCallModelJSON.mockImplementation(deferred);

    // Should not throw — every groqCall has a .catch() fallback
    const result = await runReflexionLoop("Pick today's task", makeCtx());
    expect(result).toBeDefined();
    expect(result.output).toBeTruthy();
  });

  it("strips <think>...</think> blocks from output", async () => {
    mockedCallModel
      .mockResolvedValueOnce("<think>Internal reasoning here</think>\nMessage 3 founders on LinkedIn today.")
      .mockResolvedValueOnce("Message 3 founders on LinkedIn today.")
      .mockResolvedValueOnce("Because traction requires real conversations.");
    mockedCallModelJSON.mockResolvedValueOnce({ verdict: "pass", primary_flaw: "None", specific_critique: "OK", improved_version: null });

    const result = await runReflexionLoop("Pick today's task", makeCtx());
    expect(result.output).not.toContain("<think>");
    expect(result.output).not.toContain("Internal reasoning here");
  });

  it("returns verdict=pass when critic JSON parsing fails", async () => {
    mockedCallModel
      .mockResolvedValueOnce("Message 3 founders on LinkedIn.")
      .mockResolvedValueOnce("Message 3 founders on LinkedIn today.")
      .mockResolvedValueOnce("Because conversations > planning.");
    mockedCallModelJSON.mockRejectedValueOnce(new Error("JSON_PARSE: Unexpected token"));

    const result = await runReflexionLoop("Pick today's task", makeCtx());
    expect(result.verdict).toBe("pass");
    expect(result.critique).toContain("Verdict parsing failed");
  });
});
