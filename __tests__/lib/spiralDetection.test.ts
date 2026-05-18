/**
 * __tests__/lib/spiralDetection.test.ts
 *
 * Tests for lib/cofounder/spiralDetection.ts
 *
 * Covers:
 *   - detectSpiral: all three signal categories (competitor, motivation, avoidance)
 *   - Neutral messages produce no detection
 *   - suggestedAction maps correctly to each signal
 *   - extractCompetitorFromMessage: URL and named-entity extraction
 *   - getChronicAvoidanceTasks: days threshold filtering
 *
 * Pure functions — no mocks needed except for localStorage-dependent helpers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectSpiral,
  extractCompetitorFromMessage,
  getChronicAvoidanceTasks,
} from "../../lib/cofounder/spiralDetection";

// Mock lib/plan so getLimits() doesn't try to hit localStorage in Node
vi.mock("../../lib/plan", () => ({
  getLimits: vi.fn(() => ({ unlimitedAITasks: true })),
  getPlan: vi.fn(() => "builder"),
}));

// ── detectSpiral — competitor signals ─────────────────────────────────────────

describe("detectSpiral — competitor signal", () => {
  it("detects 'someone is already doing this'", () => {
    const r = detectSpiral("Someone is already doing this exact thing.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("competitor");
    expect(r.suggestedAction).toBe("competitor_reframe");
  });

  it("detects 'someone already built'", () => {
    const r = detectSpiral("Someone already built a tool for this last year.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("competitor");
  });

  it("detects 'too late for'", () => {
    const r = detectSpiral("I think I'm too late for this market.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("competitor");
  });

  it("detects 'competitor just'", () => {
    const r = detectSpiral("A competitor just launched exactly this.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("competitor");
  });

  it("detects 'there's already a tool'", () => {
    const r = detectSpiral("There's already a tool that does this.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("competitor");
  });

  it("detects major company names in competitor context", () => {
    const r = detectSpiral("Notion already does this better than I can.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("competitor");
  });

  it("is case-insensitive", () => {
    const r = detectSpiral("SOMEONE IS ALREADY DOING THIS.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("competitor");
  });
});

// ── detectSpiral — motivation collapse signals ────────────────────────────────

describe("detectSpiral — motivation signal", () => {
  it("detects 'what's the point'", () => {
    const r = detectSpiral("What's the point of building this anymore?");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("motivation");
    expect(r.suggestedAction).toBe("motivation_reset");
  });

  it("detects 'nobody cares'", () => {
    const r = detectSpiral("Nobody cares about this problem.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("motivation");
  });

  it("detects 'nobody will use'", () => {
    const r = detectSpiral("Nobody will use what I'm building.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("motivation");
  });

  it("detects 'I should give up'", () => {
    const r = detectSpiral("I should just give up on this.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("motivation");
  });

  it("detects 'maybe I should quit'", () => {
    const r = detectSpiral("Maybe I should quit and find a job.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("motivation");
  });

  it("detects 'this is a bad idea'", () => {
    const r = detectSpiral("This is a bad idea and I know it.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("motivation");
  });

  it("detects 'why am I'", () => {
    const r = detectSpiral("Why am I even bothering with this?");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("motivation");
  });

  it("detects 'I don't see the point'", () => {
    const r = detectSpiral("I don't see the point in continuing.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("motivation");
  });
});

// ── detectSpiral — avoidance signals ─────────────────────────────────────────

describe("detectSpiral — avoidance signal", () => {
  it("detects 'I keep putting off'", () => {
    const r = detectSpiral("I keep putting off the customer interviews.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("avoidance");
    expect(r.suggestedAction).toBe("task_breakdown");
  });

  it("detects 'I keep avoiding'", () => {
    const r = detectSpiral("I keep avoiding the pricing conversation.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("avoidance");
  });

  it("detects 'haven't touched'", () => {
    const r = detectSpiral("I haven't touched the codebase in two weeks.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("avoidance");
  });

  it("detects 'I'm stuck on'", () => {
    const r = detectSpiral("I'm stuck on the onboarding flow.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("avoidance");
  });

  it("detects 'can't bring myself to'", () => {
    const r = detectSpiral("I can't bring myself to send the cold emails.");
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("avoidance");
  });
});

// ── detectSpiral — neutral messages ──────────────────────────────────────────

describe("detectSpiral — neutral messages", () => {
  const neutralMessages = [
    "What should I work on today?",
    "How do I improve my onboarding?",
    "Can you help me write a pitch deck?",
    "I finished my customer interviews.",
    "We got our first paying user!",
    "What metrics should I track?",
    "Help me think through my pricing.",
  ];

  it.each(neutralMessages)("does NOT detect spiral in: %s", (msg) => {
    const r = detectSpiral(msg);
    expect(r.detected).toBe(false);
    expect(r.signal).toBeNull();
    expect(r.suggestedAction).toBeNull();
  });
});

// ── detectSpiral — matchedPhrase ──────────────────────────────────────────────

describe("detectSpiral — matchedPhrase", () => {
  it("populates matchedPhrase for detected spirals", () => {
    const r = detectSpiral("Someone already built this startup idea.");
    expect(r.detected).toBe(true);
    expect(typeof r.matchedPhrase).toBe("string");
    expect((r.matchedPhrase ?? "").length).toBeGreaterThan(0);
  });

  it("does not populate matchedPhrase for clean messages", () => {
    const r = detectSpiral("What should I do today?");
    expect(r.matchedPhrase).toBeUndefined();
  });
});

// ── extractCompetitorFromMessage ──────────────────────────────────────────────

describe("extractCompetitorFromMessage", () => {
  it("extracts a URL when present", () => {
    const r = extractCompetitorFromMessage("I saw https://notion.so already does this.");
    expect(r.url).toBe("https://notion.so");
  });

  it("extracts a named competitor using PascalCase pattern", () => {
    const r = extractCompetitorFromMessage("I saw Linear already has this feature.");
    expect(r.name).toBe("Linear");
  });

  it("returns empty object when no URL or competitor name found", () => {
    const r = extractCompetitorFromMessage("There are many competitors out there.");
    expect(r.url).toBeUndefined();
    expect(r.name).toBeUndefined();
  });

  it("prefers URL over name when both could match", () => {
    const r = extractCompetitorFromMessage("Notion at https://notion.so is already doing this.");
    expect(r.url).toBeDefined();
  });
});

// ── getChronicAvoidanceTasks ──────────────────────────────────────────────────

describe("getChronicAvoidanceTasks", () => {
  it("returns tasks that have been on the list for 3+ days", () => {
    const tasks = [
      { task: "customer interview", daysSinceAdded: 3 },
      { task: "write landing page", daysSinceAdded: 1 },
      { task: "pricing research", daysSinceAdded: 5 },
    ];
    const chronic = getChronicAvoidanceTasks(tasks);
    expect(chronic).toContain("customer interview");
    expect(chronic).toContain("pricing research");
    expect(chronic).not.toContain("write landing page");
  });

  it("returns empty array when no tasks qualify", () => {
    const tasks = [
      { task: "email draft", daysSinceAdded: 0 },
      { task: "deploy fix", daysSinceAdded: 2 },
    ];
    expect(getChronicAvoidanceTasks(tasks)).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(getChronicAvoidanceTasks([])).toHaveLength(0);
  });

  it("includes tasks at exactly 3 days (boundary)", () => {
    const tasks = [{ task: "sales call", daysSinceAdded: 3 }];
    expect(getChronicAvoidanceTasks(tasks)).toContain("sales call");
  });
});
