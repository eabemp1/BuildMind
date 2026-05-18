/**
 * __tests__/lib/patternDetection.test.ts
 *
 * Tests for lib/patternDetection.ts
 *
 * All four detection signals:
 *   1. AVOIDANCE      — task zone appears 3+ times in recent titles
 *   2. OVERRIDE_CLUSTER — 3+ overrides with ≥50% override rate
 *   3. MOMENTUM_DECAY — score drops >10pts week-over-week below 50
 *   4. TOPIC_REPEAT   — topic mentioned without action
 *
 * Also covers: priority ordering, prompt injection, shouldSurfacePattern cooldown.
 * Pure functions — no mocks needed.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  detectPattern,
  buildPatternPromptInjection,
  shouldSurfacePattern,
} from "../../lib/patternDetection";
import type { PatternContext } from "../../lib/patternDetection";

// ── Helpers ───────────────────────────────────────────────────────────────────

function baseCtx(overrides: Partial<PatternContext> = {}): PatternContext {
  return {
    avoidance_zones: [],
    override_reasons: [],
    tasks_overridden_this_week: 0,
    tasks_accepted_this_week: 5,
    momentum_score: 60,
    momentum_last_week: null,
    topics_mentioned_repeatedly: [],
    recent_task_titles: [],
    days_inactive: 0,
    ...overrides,
  };
}

// ── detectPattern — returns NO_PATTERN when nothing fires ─────────────────────

describe("detectPattern — clean slate", () => {
  it("returns signal: null when no patterns are present", () => {
    const result = detectPattern(baseCtx());
    expect(result.signal).toBeNull();
    expect(result.message).toBe("");
    expect(result.subject).toBeNull();
  });
});

// ── 1. AVOIDANCE ─────────────────────────────────────────────────────────────

describe("detectPattern — AVOIDANCE signal", () => {
  it("fires when zone appears 3+ times in recent_task_titles", () => {
    const result = detectPattern(baseCtx({
      avoidance_zones: ["customer discovery"],
      recent_task_titles: [
        "customer discovery call",
        "customer discovery outreach",
        "customer discovery interview",
      ],
    }));
    expect(result.signal).toBe("avoidance");
    expect(result.severity).toBe("high");
    expect(result.subject).toBe("customer discovery");
    expect(result.message).toContain("3 times");
  });

  it("does NOT fire when zone appears fewer than 3 times", () => {
    const result = detectPattern(baseCtx({
      avoidance_zones: ["sales"],
      recent_task_titles: ["sales call", "sales prep"],
    }));
    // With one avoidance zone but <3 appearances, and no second zone for soft trigger
    expect(result.signal).toBeNull();
  });

  it("fires soft avoidance (medium) when 2+ zones exist but no task title matches", () => {
    const result = detectPattern(baseCtx({
      avoidance_zones: ["pricing", "sales"],
      recent_task_titles: ["build feature", "write docs"],
    }));
    expect(result.signal).toBe("avoidance");
    expect(result.severity).toBe("medium");
    expect(result.message).toContain("pricing");
    expect(result.message).toContain("sales");
  });

  it("is case-insensitive when matching task titles to zones", () => {
    const result = detectPattern(baseCtx({
      avoidance_zones: ["Sales"],
      recent_task_titles: ["SALES email", "sales call", "sales demo"],
    }));
    expect(result.signal).toBe("avoidance");
    expect(result.severity).toBe("high");
  });

  it("sets subject to the first avoidance zone", () => {
    const result = detectPattern(baseCtx({
      avoidance_zones: ["pricing", "sales"],
      recent_task_titles: [],
    }));
    expect(result.subject).toBe("pricing");
  });
});

// ── 2. OVERRIDE_CLUSTER ───────────────────────────────────────────────────────

describe("detectPattern — OVERRIDE_CLUSTER signal", () => {
  it("fires when 3+ overrides AND override rate ≥ 50%", () => {
    const result = detectPattern(baseCtx({
      tasks_overridden_this_week: 3,
      tasks_accepted_this_week: 2,  // 3/(3+2) = 60%
    }));
    expect(result.signal).toBe("override_cluster");
    expect(result.severity).toBe("high");
    expect(result.message).toContain("3");
  });

  it("does NOT fire when override count is below 3", () => {
    const result = detectPattern(baseCtx({
      tasks_overridden_this_week: 2,
      tasks_accepted_this_week: 1,  // rate = 67% but count < 3
    }));
    expect(result.signal).toBeNull();
  });

  it("does NOT fire when override rate is below 50%", () => {
    const result = detectPattern(baseCtx({
      tasks_overridden_this_week: 3,
      tasks_accepted_this_week: 10,  // 3/13 = 23%
    }));
    expect(result.signal).toBeNull();
  });

  it("includes reason summary in message when override_reasons is populated", () => {
    const result = detectPattern(baseCtx({
      tasks_overridden_this_week: 4,
      tasks_accepted_this_week: 2,
      override_reasons: ["too tired", "wrong priority"],
    }));
    expect(result.signal).toBe("override_cluster");
    expect(result.message).toContain("too tired");
    expect(result.message).toContain("wrong priority");
  });

  it("sets subject to last override reason when available", () => {
    const result = detectPattern(baseCtx({
      tasks_overridden_this_week: 3,
      tasks_accepted_this_week: 1,
      override_reasons: ["distracted", "not ready"],
    }));
    expect(result.subject).toBe("not ready");
  });

  it("sets subject to null when no override_reasons", () => {
    const result = detectPattern(baseCtx({
      tasks_overridden_this_week: 3,
      tasks_accepted_this_week: 2,
      override_reasons: [],
    }));
    expect(result.subject).toBeNull();
  });
});

// ── 3. MOMENTUM_DECAY ────────────────────────────────────────────────────────

describe("detectPattern — MOMENTUM_DECAY signal", () => {
  it("fires when score dropped more than 10pts from last week and is below 50", () => {
    const result = detectPattern(baseCtx({
      momentum_score: 35,
      momentum_last_week: 50,
    }));
    expect(result.signal).toBe("momentum_decay");
    expect(result.message).toContain("15 points");
  });

  it("does NOT fire when score is above 50 even if drop > 10", () => {
    const result = detectPattern(baseCtx({
      momentum_score: 55,
      momentum_last_week: 70,
    }));
    expect(result.signal).toBeNull();
  });

  it("does NOT fire when drop is exactly 10 (requires > 10)", () => {
    const result = detectPattern(baseCtx({
      momentum_score: 39,
      momentum_last_week: 49,  // drop = 10, not > 10
    }));
    expect(result.signal).toBeNull();
  });

  it("sets severity to high when score below 35", () => {
    const result = detectPattern(baseCtx({
      momentum_score: 20,
      momentum_last_week: 45,
    }));
    expect(result.signal).toBe("momentum_decay");
    expect(result.severity).toBe("high");
  });

  it("sets severity to medium when score is 35-49", () => {
    const result = detectPattern(baseCtx({
      momentum_score: 40,
      momentum_last_week: 55,
    }));
    expect(result.signal).toBe("momentum_decay");
    expect(result.severity).toBe("medium");
  });

  it("does NOT fire when momentum_last_week is null", () => {
    const result = detectPattern(baseCtx({
      momentum_score: 20,
      momentum_last_week: null,
    }));
    expect(result.signal).toBeNull();
  });
});

// ── 4. TOPIC_REPEAT ──────────────────────────────────────────────────────────

describe("detectPattern — TOPIC_REPEAT signal", () => {
  it("fires when topics_mentioned_repeatedly is non-empty", () => {
    const result = detectPattern(baseCtx({
      topics_mentioned_repeatedly: ["pricing model"],
    }));
    expect(result.signal).toBe("topic_repeat");
    expect(result.severity).toBe("medium");
    expect(result.subject).toBe("pricing model");
    expect(result.message).toContain("pricing model");
  });

  it("uses the first topic as subject", () => {
    const result = detectPattern(baseCtx({
      topics_mentioned_repeatedly: ["technical debt", "hiring"],
    }));
    expect(result.subject).toBe("technical debt");
  });

  it("does NOT fire when topics list is empty", () => {
    const result = detectPattern(baseCtx({
      topics_mentioned_repeatedly: [],
    }));
    expect(result.signal).toBeNull();
  });
});

// ── Priority ordering ─────────────────────────────────────────────────────────

describe("detectPattern — signal priority ordering", () => {
  it("AVOIDANCE takes priority over OVERRIDE_CLUSTER", () => {
    const result = detectPattern(baseCtx({
      avoidance_zones: ["sales", "outreach"],   // triggers soft avoidance
      tasks_overridden_this_week: 4,
      tasks_accepted_this_week: 2,              // triggers override_cluster too
    }));
    expect(result.signal).toBe("avoidance");
  });

  it("OVERRIDE_CLUSTER takes priority over MOMENTUM_DECAY", () => {
    const result = detectPattern(baseCtx({
      tasks_overridden_this_week: 3,
      tasks_accepted_this_week: 2,
      momentum_score: 30,
      momentum_last_week: 50,
    }));
    expect(result.signal).toBe("override_cluster");
  });

  it("MOMENTUM_DECAY takes priority over TOPIC_REPEAT", () => {
    const result = detectPattern(baseCtx({
      momentum_score: 30,
      momentum_last_week: 55,
      topics_mentioned_repeatedly: ["fundraising"],
    }));
    expect(result.signal).toBe("momentum_decay");
  });
});

// ── buildPatternPromptInjection ───────────────────────────────────────────────

describe("buildPatternPromptInjection", () => {
  it("returns empty string when signal is null", () => {
    const result = buildPatternPromptInjection({
      signal: null,
      message: "",
      subject: null,
      severity: "low",
    });
    expect(result).toBe("");
  });

  it("includes the pattern signal in the injection string", () => {
    const result = buildPatternPromptInjection({
      signal: "avoidance",
      message: "You have avoided sales 3 times.",
      subject: "sales",
      severity: "high",
    });
    expect(result).toContain("AVOIDANCE");
    expect(result).toContain("You have avoided sales 3 times.");
  });

  it("includes 'Name it directly' for high severity", () => {
    const result = buildPatternPromptInjection({
      signal: "override_cluster",
      message: "Pattern detected.",
      subject: null,
      severity: "high",
    });
    expect(result).toContain("Name it directly");
  });

  it("includes 'Name it with care' for medium severity", () => {
    const result = buildPatternPromptInjection({
      signal: "momentum_decay",
      message: "Momentum has dropped.",
      subject: null,
      severity: "medium",
    });
    expect(result).toContain("Name it with care");
  });
});

// ── shouldSurfacePattern ──────────────────────────────────────────────────────

describe("shouldSurfacePattern — cooldown logic", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true when lastPatternShownAt is null (never shown)", () => {
    expect(shouldSurfacePattern(null, "high")).toBe(true);
    expect(shouldSurfacePattern(undefined, "medium")).toBe(true);
  });

  it("returns false for high severity within 24h cooldown", () => {
    vi.useFakeTimers();
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    expect(shouldSurfacePattern(sixHoursAgo, "high")).toBe(false);
  });

  it("returns true for high severity after 24h cooldown has elapsed", () => {
    vi.useFakeTimers();
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(shouldSurfacePattern(twentyFiveHoursAgo, "high")).toBe(true);
  });

  it("returns false for medium severity within 48h cooldown", () => {
    vi.useFakeTimers();
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    expect(shouldSurfacePattern(thirtyHoursAgo, "medium")).toBe(false);
  });

  it("returns true for medium severity after 48h cooldown has elapsed", () => {
    vi.useFakeTimers();
    const fortyNineHoursAgo = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
    expect(shouldSurfacePattern(fortyNineHoursAgo, "medium")).toBe(true);
  });

  it("low severity uses 48h cooldown same as medium", () => {
    vi.useFakeTimers();
    const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    expect(shouldSurfacePattern(twentyHoursAgo, "low")).toBe(false);
  });
});
