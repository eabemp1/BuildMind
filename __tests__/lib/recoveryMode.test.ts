/**
 * __tests__/lib/recoveryMode.test.ts
 *
 * Tests for lib/recoveryMode.ts — Forgiveness Protocol & Recovery Mode
 *
 * Covers:
 *   - shouldActivateRecoveryMode (activation threshold)
 *   - getRecoveryModeMessage (copy integrity)
 *   - momentumAfterResetMission (momentum math)
 *   - shouldShowScoreIsolated (UX rule)
 *   - generateResetMission (AI path mocked + fallback path)
 *
 * generateResetMission's AI call is mocked — we test the
 * contract (shape, estimatedMinutes cap, fallback) not the model output.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  shouldActivateRecoveryMode,
  getRecoveryModeMessage,
  momentumAfterResetMission,
  shouldShowScoreIsolated,
  generateResetMission,
} from "../../lib/recoveryMode";

// ── shouldActivateRecoveryMode ────────────────────────────────────────────────

describe("shouldActivateRecoveryMode", () => {
  it("activates when daysInactive ≥ 3 and score is decaying", () => {
    expect(shouldActivateRecoveryMode(3, 40, 50)).toBe(true);
  });

  it("activates when daysInactive > 3 and score is decaying", () => {
    expect(shouldActivateRecoveryMode(7, 30, 60)).toBe(true);
  });

  it("does NOT activate when daysInactive < 3 even if decaying", () => {
    expect(shouldActivateRecoveryMode(2, 30, 60)).toBe(false);
  });

  it("does NOT activate when score is NOT decaying (equal)", () => {
    expect(shouldActivateRecoveryMode(3, 50, 50)).toBe(false);
  });

  it("does NOT activate when score is increasing (not decaying)", () => {
    expect(shouldActivateRecoveryMode(3, 60, 50)).toBe(false);
  });

  it("does NOT activate at daysInactive=0 regardless of score", () => {
    expect(shouldActivateRecoveryMode(0, 10, 80)).toBe(false);
  });

  it("activates at the exact 3-day threshold with minimal decay", () => {
    expect(shouldActivateRecoveryMode(3, 49, 50)).toBe(true);
  });
});

// ── getRecoveryModeMessage ────────────────────────────────────────────────────

describe("getRecoveryModeMessage", () => {
  it("returns a non-empty string", () => {
    const msg = getRecoveryModeMessage();
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(10);
  });

  it("message does not contain shame language", () => {
    const msg = getRecoveryModeMessage().toLowerCase();
    const shameWords = ["failed", "failure", "lazy", "useless", "quit", "give up"];
    shameWords.forEach(word => {
      expect(msg).not.toContain(word);
    });
  });

  it("message references a small/quick task framing", () => {
    const msg = getRecoveryModeMessage().toLowerCase();
    // Should mention something small — "5 minutes" or "one thing"
    const hasSmallFraming = msg.includes("5 minutes") || msg.includes("one thing") || msg.includes("small");
    expect(hasSmallFraming).toBe(true);
  });
});

// ── momentumAfterResetMission ─────────────────────────────────────────────────

describe("momentumAfterResetMission", () => {
  it("adds exactly 4 points to current momentum", () => {
    expect(momentumAfterResetMission(50)).toBe(54);
    expect(momentumAfterResetMission(30)).toBe(34);
  });

  it("does not exceed 100 when already near cap", () => {
    expect(momentumAfterResetMission(98)).toBe(100);
    expect(momentumAfterResetMission(100)).toBe(100);
  });

  it("works correctly at momentum=0", () => {
    expect(momentumAfterResetMission(0)).toBe(4);
  });

  it("adds less than a full task completion (which adds 6-12)", () => {
    const result = momentumAfterResetMission(50);
    expect(result - 50).toBeLessThan(6);
  });
});

// ── shouldShowScoreIsolated ───────────────────────────────────────────────────

describe("shouldShowScoreIsolated", () => {
  it("returns false (hide score alone) when recovery is active", () => {
    expect(shouldShowScoreIsolated(true)).toBe(false);
  });

  it("returns true (show score) when recovery is NOT active", () => {
    expect(shouldShowScoreIsolated(false)).toBe(true);
  });
});

// ── generateResetMission ──────────────────────────────────────────────────────

const mockCallModelJSON = vi.fn();

vi.mock("../../lib/ai-providers", () => ({
  callModelJSON: (...args: unknown[]) => mockCallModelJSON(...args),
  callModel: vi.fn(),
  hasAIProvider: vi.fn(() => true),
}));

const baseContext = {
  startupSummary: "A compliance tool for African SMEs",
  stage: "Validation",
  momentumScore: 25,
  avoidanceSignals: ["customer interviews"],
};

describe("generateResetMission — AI success path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns task, rationale, and estimatedMinutes from AI response", async () => {
    mockCallModelJSON.mockResolvedValue({
      task: "Send one DM to a founder you admire asking one question.",
      rationale: "One message restarts momentum without pressure.",
      estimatedMinutes: 5,
    });

    const mission = await generateResetMission(baseContext);
    expect(typeof mission.task).toBe("string");
    expect(mission.task.length).toBeGreaterThan(5);
    expect(typeof mission.rationale).toBe("string");
    expect(typeof mission.estimatedMinutes).toBe("number");
  });

  it("caps estimatedMinutes at 10 even if AI returns higher value", async () => {
    mockCallModelJSON.mockResolvedValue({
      task: "Write a landing page.",
      rationale: "Visibility matters.",
      estimatedMinutes: 60,  // AI hallucinated a large number
    });

    const mission = await generateResetMission(baseContext);
    expect(mission.estimatedMinutes).toBeLessThanOrEqual(10);
  });

  it("uses fallback task when AI returns missing task field", async () => {
    mockCallModelJSON.mockResolvedValue({
      task: undefined,
      rationale: "Something.",
      estimatedMinutes: 5,
    });

    const mission = await generateResetMission(baseContext);
    expect(mission.task.length).toBeGreaterThan(10);
  });
});

describe("generateResetMission — AI failure fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a valid fallback mission when AI call throws", async () => {
    mockCallModelJSON.mockRejectedValue(new Error("GROQ_API_KEY not set"));

    const mission = await generateResetMission(baseContext);
    expect(typeof mission.task).toBe("string");
    expect(mission.task.length).toBeGreaterThan(10);
    expect(mission.estimatedMinutes).toBeLessThanOrEqual(10);
    expect(typeof mission.rationale).toBe("string");
  });

  it("fallback estimatedMinutes is 5", async () => {
    mockCallModelJSON.mockRejectedValue(new Error("network error"));

    const mission = await generateResetMission(baseContext);
    expect(mission.estimatedMinutes).toBe(5);
  });
});
