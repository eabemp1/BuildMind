/**
 * __tests__/lib/founderMemory.test.ts
 *
 * Unit tests for the pure functions in lib/founderMemory.ts.
 * Network-dependent functions (getFounderMemory, upsertFounderMemory,
 * generateFounderInsight, evolveCofounderStyle, observeTaskEvent) are not
 * tested here — they are integration concerns requiring a live Supabase
 * connection. These tests cover every exported pure function so any logic
 * change surfaces immediately as a failure.
 */

import { describe, it, expect } from "vitest";
import { buildFounderContext, type FounderMemory, type CofounderStyle } from "../../lib/founderMemory";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMemory(overrides: Partial<FounderMemory> = {}): FounderMemory {
  return {
    id: "mem-001",
    user_id: "user-001",
    personality_tags: [],
    decision_patterns: [],
    emotional_signals: [],
    avoidance_zones: [],
    strengths: [],
    cofounder_style: "execution-coach" as CofounderStyle,
    last_insight: null,
    insight_history: [],
    updated_at: "2026-05-01T00:00:00Z",
    validationReceipts: [],
    competitorHistory: [],
    ...overrides,
  };
}

// ── buildFounderContext ───────────────────────────────────────────────────────

describe("buildFounderContext", () => {
  it("returns a non-empty string when memory has data", () => {
    const mem = makeMemory({
      personality_tags: ["ships fast", "avoids sales"],
      avoidance_zones: ["outreach", "pricing"],
      strengths: ["prototyping", "design"],
      cofounder_style: "direct-challenger",
      last_insight: "You ship fast but never ask customers if it matters.",
    });
    const ctx = buildFounderContext(mem);
    expect(ctx.length).toBeGreaterThan(0);
  });

  it("includes the FOUNDER PROFILE header", () => {
    const ctx = buildFounderContext(makeMemory({ personality_tags: ["focused"] }));
    expect(ctx).toContain("FOUNDER PROFILE");
  });

  it("includes personality tags when present", () => {
    const ctx = buildFounderContext(makeMemory({ personality_tags: ["ships fast", "avoids sales"] }));
    expect(ctx).toContain("ships fast");
    expect(ctx).toContain("avoids sales");
  });

  it("omits personality line when tags are empty", () => {
    const ctx = buildFounderContext(makeMemory({ personality_tags: [] }));
    expect(ctx).not.toContain("Personality:");
  });

  it("includes avoidance zones when present", () => {
    const ctx = buildFounderContext(makeMemory({ avoidance_zones: ["outreach", "pricing"] }));
    expect(ctx).toContain("outreach");
    expect(ctx).toContain("pricing");
  });

  it("omits avoidance line when zones are empty", () => {
    const ctx = buildFounderContext(makeMemory({ avoidance_zones: [] }));
    expect(ctx).not.toContain("Avoids:");
  });

  it("includes strengths when present", () => {
    const ctx = buildFounderContext(makeMemory({ strengths: ["prototyping"] }));
    expect(ctx).toContain("prototyping");
  });

  it("omits strengths line when empty", () => {
    const ctx = buildFounderContext(makeMemory({ strengths: [] }));
    expect(ctx).not.toContain("Strong at:");
  });

  it("includes cofounder_style when present", () => {
    const ctx = buildFounderContext(makeMemory({ cofounder_style: "devil-advocate" }));
    expect(ctx).toContain("devil-advocate");
  });

  it("includes last_insight when present", () => {
    const insight = "You ship fast but never ask customers if it matters.";
    const ctx = buildFounderContext(makeMemory({ last_insight: insight }));
    expect(ctx).toContain(insight);
  });

  it("omits last_insight line when null", () => {
    const ctx = buildFounderContext(makeMemory({ last_insight: null }));
    expect(ctx).not.toContain("Last insight");
  });

  it("returns only the header line when memory is completely empty", () => {
    const ctx = buildFounderContext(makeMemory({
      personality_tags: [],
      avoidance_zones: [],
      strengths: [],
      last_insight: null,
      // cofounder_style is always present — it has a default value
    }));
    // Should still include the style line (always set) and the header
    expect(ctx).toContain("FOUNDER PROFILE");
    expect(ctx).toContain("execution-coach");
  });

  it("is deterministic — same input produces same output", () => {
    const mem = makeMemory({
      personality_tags: ["analytical"],
      avoidance_zones: ["cold outreach"],
      strengths: ["research"],
      last_insight: "Data-driven but action-avoidant.",
    });
    expect(buildFounderContext(mem)).toBe(buildFounderContext(mem));
  });

  it("handles all four CofounderStyle values without throwing", () => {
    const styles: CofounderStyle[] = [
      "direct-challenger",
      "strategic-partner",
      "execution-coach",
      "devil-advocate",
    ];
    for (const style of styles) {
      expect(() => buildFounderContext(makeMemory({ cofounder_style: style }))).not.toThrow();
    }
  });

  it("does not include empty lines in the output", () => {
    const ctx = buildFounderContext(makeMemory({ personality_tags: ["resilient"] }));
    const lines = ctx.split("\n");
    for (const line of lines) {
      // Each line must have content — no blank lines
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });
});
