/**
 * __tests__/lib/learning.test.ts
 *
 * Tests for lib/learning.ts — Behavioral Learning Loop
 *
 * Covers all pure functions (no DB calls):
 *   - inferActionType: all 7 categories + fallback
 *   - inferActionPlatform: all 8 platforms + fallback
 *   - deriveLearnedPatterns: preferred/avoided types, completion rate,
 *     reliability threshold, override reasons, pivot dedup
 *   - buildLearnedPatternsPrompt: returns empty when unreliable,
 *     correct sections when reliable, low/high completion rate signals
 *
 * Database-dependent functions (getLearnedPatterns, recordActionShown, etc.)
 * are not tested here — they belong in integration tests.
 */

import { describe, it, expect } from "vitest";
import {
  inferActionType,
  inferActionPlatform,
  deriveLearnedPatterns,
  buildLearnedPatternsPrompt,
} from "../../lib/learning";
import type { LearningLogRow } from "../../lib/learning";

// ── inferActionType ───────────────────────────────────────────────────────────

describe("inferActionType — all categories", () => {
  const cases: [string, string][] = [
    // user_interview
    ["Talk to 5 potential users about their workflow",      "user_interview"],
    ["Conduct a user research call with Sarah",             "user_interview"],
    ["Interview 3 founders in the space",                   "user_interview"],
    ["Ask 10 people about the problem",                     "user_interview"],
    // content
    ["Post a thread on X about the problem",                "content"],
    ["Write a blog post about your journey",                "content"],
    ["Publish a LinkedIn article",                          "content"],
    ["Tweet about your product launch",                     "content"],
    // outreach
    ["Send a cold email to 20 target users",                "outreach"],
    ["DM potential customers on LinkedIn",                  "outreach"],
    ["Reach out to 5 founders for feedback",                "outreach"],
    ["Message 10 people on WhatsApp",                       "outreach"],
    // build
    ["Code the onboarding flow",                            "build"],
    ["Deploy the feature to production",                    "build"],
    ["Ship the MVP this week",                              "build"],
    ["Implement the payment integration",                   "build"],
    // research
    ["Research competitors in the market",                  "research"],
    ["Analyse pricing strategies in this niche",            "research"],
    ["Look up what regulations apply",                      "research"],
    ["Study the top 5 players in the space",                "research"],
    // pivot
    ["Reposition for a different market segment",           "pivot"],
    ["Niche down to solo founders only",                    "pivot"],
    ["Change target audience to SMEs",                      "pivot"],
    // pricing
    ["Set your pricing and publish it",                     "pricing"],
    ["Decide what to charge for the product",               "pricing"],
    ["Add a subscription plan to the site",                 "pricing"],
    // other (catch-all)
    ["Think about your vision",                             "other"],
    ["Drink coffee and get inspired",                       "other"],
  ];

  it.each(cases)('inferActionType("%s") → %s', (action, expected) => {
    expect(inferActionType(action)).toBe(expected);
  });
});

// ── inferActionPlatform ───────────────────────────────────────────────────────

describe("inferActionPlatform — all platforms", () => {
  const cases: [string, string][] = [
    ["Send a LinkedIn message to potential users",  "linkedin"],
    ["Post in the WhatsApp group",                  "whatsapp"],
    ["Tweet about your product",                    "twitter"],
    ["Post on x.com about the launch",              "twitter"],
    ["Send a cold email to founders",               "email"],
    ["Reply to Gmail inbox",                        "email"],
    ["Post on Reddit r/startups",                   "reddit"],
    ["Share on your subreddit",                     "reddit"],
    ["Post a Reel on Instagram",                    "instagram"],
    ["Share in the Slack community",                "slack"],
    ["Call them and ask for feedback",              "phone"],
    ["Ring the customer directly",                  "phone"],
    ["Write a blog post on your site",              "other"],
    ["Do a user interview via Zoom",                "other"],
  ];

  it.each(cases)('inferActionPlatform("%s") → %s', (action, expected) => {
    expect(inferActionPlatform(action)).toBe(expected);
  });
});

// ── deriveLearnedPatterns — helpers ──────────────────────────────────────────

function makeRow(overrides: Partial<LearningLogRow> = {}): LearningLogRow {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: "user-test",
    action_text: "Default action",
    action_type: "build",
    action_platform: "other",
    outcome: "pending",
    outcome_note: null,
    pivot_angle: null,
    shown_at: new Date().toISOString(),
    resolved_at: null,
    ...overrides,
  };
}

// ── deriveLearnedPatterns — empty / edge cases ────────────────────────────────

describe("deriveLearnedPatterns — empty input", () => {
  it("returns all-empty arrays for empty rows", () => {
    const result = deriveLearnedPatterns([]);
    expect(result.preferred_action_types).toHaveLength(0);
    expect(result.avoided_action_types).toHaveLength(0);
    expect(result.completion_rate).toBe(0);
    expect(result.total_logged).toBe(0);
    expect(result.patterns_reliable).toBe(false);
  });

  it("returns patterns_reliable: false when fewer than 5 rows", () => {
    const rows = [makeRow({ outcome: "completed" }), makeRow({ outcome: "completed" })];
    const result = deriveLearnedPatterns(rows);
    expect(result.patterns_reliable).toBe(false);
  });

  it("returns patterns_reliable: true when 5 or more rows", () => {
    const rows = Array.from({ length: 5 }, () => makeRow({ outcome: "completed" }));
    const result = deriveLearnedPatterns(rows);
    expect(result.patterns_reliable).toBe(true);
  });
});

// ── deriveLearnedPatterns — completion rate ───────────────────────────────────

describe("deriveLearnedPatterns — completion rate", () => {
  it("calculates 100% completion rate when all resolved are completed", () => {
    const rows = Array.from({ length: 5 }, () => makeRow({ outcome: "completed" }));
    expect(deriveLearnedPatterns(rows).completion_rate).toBe(1);
  });

  it("calculates 0% completion rate when all resolved are overridden", () => {
    const rows = Array.from({ length: 5 }, () => makeRow({ outcome: "overridden" }));
    expect(deriveLearnedPatterns(rows).completion_rate).toBe(0);
  });

  it("ignores pending rows in rate calculation", () => {
    const rows = [
      makeRow({ outcome: "completed" }),
      makeRow({ outcome: "completed" }),
      makeRow({ outcome: "pending" }),  // should be excluded
      makeRow({ outcome: "pending" }),
      makeRow({ outcome: "pending" }),
    ];
    // 2 completed / 2 resolved = 1.0
    expect(deriveLearnedPatterns(rows).completion_rate).toBe(1);
  });

  it("counts partial as completed in rate", () => {
    const rows = [
      makeRow({ outcome: "partial" }),
      makeRow({ outcome: "overridden" }),
      makeRow({ outcome: "completed" }),
      makeRow({ outcome: "ignored" }),
      makeRow({ outcome: "completed" }),
    ];
    // 3 (partial+2completed) / 5 resolved = 0.6
    expect(deriveLearnedPatterns(rows).completion_rate).toBe(0.6);
  });
});

// ── deriveLearnedPatterns — preferred and avoided types ──────────────────────

describe("deriveLearnedPatterns — preferred_action_types", () => {
  it("includes action type completed 2+ times more than failed", () => {
    const rows = [
      makeRow({ outcome: "completed", action_type: "build" }),
      makeRow({ outcome: "completed", action_type: "build" }),
      makeRow({ outcome: "completed", action_type: "build" }),
      makeRow({ outcome: "overridden", action_type: "outreach" }),
      makeRow({ outcome: "overridden", action_type: "outreach" }),
    ];
    const result = deriveLearnedPatterns(rows);
    expect(result.preferred_action_types).toContain("build");
    expect(result.preferred_action_types).not.toContain("outreach");
  });

  it("does NOT include action type completed only once", () => {
    const rows = [
      makeRow({ outcome: "completed", action_type: "research" }),
      makeRow({ outcome: "completed", action_type: "build" }),
      makeRow({ outcome: "completed", action_type: "build" }),
      makeRow({ outcome: "ignored", action_type: "content" }),
      makeRow({ outcome: "ignored", action_type: "content" }),
    ];
    const result = deriveLearnedPatterns(rows);
    expect(result.preferred_action_types).not.toContain("research"); // only 1
  });

  it("caps preferred_action_types at 3", () => {
    // Make 4 action types each completed 3 times
    const types = ["build", "research", "content", "pricing"] as const;
    const rows = types.flatMap(t => [
      makeRow({ outcome: "completed", action_type: t }),
      makeRow({ outcome: "completed", action_type: t }),
      makeRow({ outcome: "completed", action_type: t }),
    ]);
    const result = deriveLearnedPatterns(rows);
    expect(result.preferred_action_types.length).toBeLessThanOrEqual(3);
  });
});

describe("deriveLearnedPatterns — avoided_action_types", () => {
  it("includes action type failed 2+ times more than completed", () => {
    const rows = [
      makeRow({ outcome: "overridden", action_type: "outreach" }),
      makeRow({ outcome: "overridden", action_type: "outreach" }),
      makeRow({ outcome: "overridden", action_type: "outreach" }),
      makeRow({ outcome: "completed",  action_type: "build" }),
      makeRow({ outcome: "completed",  action_type: "build" }),
    ];
    const result = deriveLearnedPatterns(rows);
    expect(result.avoided_action_types).toContain("outreach");
    expect(result.avoided_action_types).not.toContain("build");
  });
});

// ── deriveLearnedPatterns — override_reasons ─────────────────────────────────

describe("deriveLearnedPatterns — override_reasons", () => {
  it("collects outcome_note strings from overridden rows", () => {
    const rows = [
      makeRow({ outcome: "overridden", outcome_note: "Too busy today", action_type: "outreach" }),
      makeRow({ outcome: "overridden", outcome_note: "Not relevant now", action_type: "outreach" }),
      makeRow({ outcome: "completed",  outcome_note: null, action_type: "build" }),
      makeRow({ outcome: "completed",  outcome_note: null, action_type: "build" }),
      makeRow({ outcome: "completed",  outcome_note: null, action_type: "build" }),
    ];
    const result = deriveLearnedPatterns(rows);
    expect(result.override_reasons).toContain("Too busy today");
    expect(result.override_reasons).toContain("Not relevant now");
  });

  it("ignores null outcome_notes", () => {
    const rows = Array.from({ length: 5 }, () =>
      makeRow({ outcome: "overridden", outcome_note: null })
    );
    expect(deriveLearnedPatterns(rows).override_reasons).toHaveLength(0);
  });
});

// ── deriveLearnedPatterns — pivot_angles_tried ───────────────────────────────

describe("deriveLearnedPatterns — pivot_angles_tried", () => {
  it("deduplicates pivot angles", () => {
    const rows = [
      makeRow({ pivot_angle: "SMEs in Nigeria",    outcome: "completed" }),
      makeRow({ pivot_angle: "SMEs in Nigeria",    outcome: "overridden" }),  // duplicate
      makeRow({ pivot_angle: "Freelancers in Lagos", outcome: "completed" }),
      makeRow({ pivot_angle: null,                 outcome: "completed" }),
      makeRow({ pivot_angle: null,                 outcome: "completed" }),
    ];
    const result = deriveLearnedPatterns(rows);
    const unique = new Set(result.pivot_angles_tried);
    expect(unique.size).toBe(result.pivot_angles_tried.length);
    expect(result.pivot_angles_tried).toContain("SMEs in Nigeria");
    expect(result.pivot_angles_tried).toContain("Freelancers in Lagos");
  });
});

// ── buildLearnedPatternsPrompt ────────────────────────────────────────────────

describe("buildLearnedPatternsPrompt", () => {
  const unreliablePatterns = {
    preferred_action_types: [],
    avoided_action_types: [],
    avoided_platforms: [],
    override_reasons: [],
    pivot_angles_tried: [],
    completion_rate: 0.5,
    total_logged: 3,
    patterns_reliable: false,
  };

  it("returns empty string when patterns are not reliable", () => {
    expect(buildLearnedPatternsPrompt(unreliablePatterns)).toBe("");
  });

  it("returns non-empty string when patterns are reliable", () => {
    const patterns = { ...unreliablePatterns, patterns_reliable: true, total_logged: 10 };
    expect(buildLearnedPatternsPrompt(patterns).length).toBeGreaterThan(0);
  });

  it("includes preferred action types when present", () => {
    const patterns = {
      ...unreliablePatterns,
      patterns_reliable: true,
      total_logged: 10,
      preferred_action_types: ["build", "research"] as const,
    };
    const prompt = buildLearnedPatternsPrompt(patterns);
    expect(prompt).toContain("build");
    expect(prompt).toContain("research");
    expect(prompt).toContain("COMPLETES");
  });

  it("includes avoided types when present", () => {
    const patterns = {
      ...unreliablePatterns,
      patterns_reliable: true,
      total_logged: 10,
      avoided_action_types: ["outreach"] as const,
    };
    const prompt = buildLearnedPatternsPrompt(patterns);
    expect(prompt).toContain("outreach");
    expect(prompt).toContain("AVOIDS");
  });

  it("flags low completion rate with a friction-reduction instruction", () => {
    const patterns = {
      ...unreliablePatterns,
      patterns_reliable: true,
      total_logged: 10,
      completion_rate: 0.3,
    };
    const prompt = buildLearnedPatternsPrompt(patterns);
    expect(prompt.toLowerCase()).toContain("smaller");
  });

  it("flags high completion rate with a higher-leverage instruction", () => {
    const patterns = {
      ...unreliablePatterns,
      patterns_reliable: true,
      total_logged: 10,
      completion_rate: 0.8,
    };
    const prompt = buildLearnedPatternsPrompt(patterns);
    expect(prompt.toLowerCase()).toContain("harder");
  });

  it("includes pivot angles tried to prevent repetition", () => {
    const patterns = {
      ...unreliablePatterns,
      patterns_reliable: true,
      total_logged: 10,
      pivot_angles_tried: ["SMEs in Nigeria", "Freelancers"],
    };
    const prompt = buildLearnedPatternsPrompt(patterns);
    expect(prompt).toContain("SMEs in Nigeria");
    expect(prompt).toContain("do NOT repeat");
  });
});
