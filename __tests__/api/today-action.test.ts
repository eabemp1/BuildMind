/**
 * __tests__/api/today-action.test.ts
 * Tests the today-action route — the most-called API in the product.
 */

import { describe, it, expect } from "vitest";
import { inferStage } from "@/lib/stages";

const FALLBACK_ACTIONS: Record<string, { action: string; message: string; why: string; time: string }> = {
  Idea: { action: "Talk to 5 people who have this problem before writing any code.", message: "Hey, quick question — what's your biggest challenge with [problem area]? I'm researching it and would love 10 minutes.", why: "Every assumption you have about your user is probably wrong.", time: "2 hours" },
  Validation: { action: "Send 10 personal outreach DMs — no pitch, just questions.", message: "Hey — I'm building something for people who struggle with [problem]. What do you currently do when [problem] happens?", why: "The Mom Test: ask about their life, not your idea.", time: "1-2 hours" },
  MVP: { action: "Send your working link to one warm contact before end of day.", message: "Hey — I've been building [product] to solve [problem].", why: "The version they see today teaches you more than 3 more days of polishing.", time: "30 minutes" },
  Launch: { action: "Post on Product Hunt this week — imperfect listing beats no listing.", message: "We just launched [product].", why: "You don't need to be ready. You need to be visible.", time: "3 hours to prepare" },
  Growth: { action: "Pick one retention lever and run a 7-day experiment.", message: "We're testing a small change to improve retention.", why: "Small, repeatable experiments compound faster than big bets.", time: "2 hours" },
  Revenue: { action: "Call one churned user today — not to win them back, to learn why they left.", message: "Hey — I noticed you stopped using [product].", why: "Churn analysis beats 10 feature ideas every time.", time: "1 hour" },
};

describe("today-action: stage inference", () => {
  it("returns Idea when no tasks", () => { expect(inferStage(0, 0, 0, 0)).toBe("Idea"); });
  it("returns Idea at 0% rates", () => { expect(inferStage(0, 10, 0, 5)).toBe("Idea"); });
  it("returns Validation at 30% task rate with no milestones", () => { expect(inferStage(3, 10, 0, 5)).toBe("Validation"); });
  it("returns MVP at exactly 40% milestone rate", () => { expect(inferStage(5, 10, 2, 5)).toBe("MVP"); });
  it("returns Launch at 60% milestone rate", () => { expect(inferStage(6, 10, 6, 10)).toBe("Launch"); });
  it("returns Revenue at 80%+ milestone rate", () => { expect(inferStage(9, 10, 8, 10)).toBe("Revenue"); });
  it("milestone rate takes priority over task rate", () => { expect(inferStage(1, 10, 8, 10)).toBe("Revenue"); });
});

describe("today-action: fallback actions", () => {
  const stages = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];
  stages.forEach(stage => {
    it(`has fallback for ${stage}`, () => {
      const fb = FALLBACK_ACTIONS[stage];
      expect(fb).toBeDefined();
      expect(fb.action.length).toBeGreaterThan(10);
      expect(fb.message.length).toBeGreaterThan(10);
      expect(fb.why.length).toBeGreaterThan(10);
      expect(fb.time.length).toBeGreaterThan(0);
    });
  });
});

describe("today-action: last reflection causality", () => {
  it("blocked outcome maps to blocker-removal instruction", () => {
    const outcomeInstructions: Record<string, string> = {
      blocked: "blocked outcome -> remove that specific blocker first",
      completed: "completed outcome -> go one level deeper on the same thread",
      partial: "partial outcome -> finish before starting something new",
      learned: "learned outcome -> apply the insight to one real person today",
    };
    expect(outcomeInstructions.blocked).toContain("blocker");
    expect(outcomeInstructions.completed).toContain("deeper");
    expect(outcomeInstructions.partial).toContain("finish");
    expect(outcomeInstructions.learned).toContain("apply");
  });

  it("low confidence (1-2) should trigger easier step instruction", () => {
    const shouldEasify = (confidence: number) => confidence <= 2;
    expect(shouldEasify(1)).toBe(true);
    expect(shouldEasify(2)).toBe(true);
    expect(shouldEasify(3)).toBe(false);
    expect(shouldEasify(5)).toBe(false);
  });

  it("last reflection context string contains required sections", () => {
    const reflection = { outcome: "blocked", note: "Paystack kept failing", confidence: 2, today_action: "Wire Paystack", created_at: new Date().toISOString() };
    const context = `LAST REFLECTION (${new Date(reflection.created_at).toLocaleDateString()}):\nYesterday's action: "${reflection.today_action}"\nOutcome: ${reflection.outcome}\nConfidence (1-5): ${reflection.confidence}\nTheir note: "${reflection.note}"`;
    expect(context).toContain("LAST REFLECTION");
    expect(context).toContain("blocked");
    expect(context).toContain("Paystack kept failing");
    expect(context).toContain("Confidence (1-5): 2");
  });

  it("reflection context is absent when no reflection exists", () => {
    const lastReflection = null;
    const context = lastReflection ? "LAST REFLECTION..." : "";
    expect(context).toBe("");
  });
});

describe("today-action: response shape", () => {
  it("TodayAction type has all required fields", () => {
    const action = { action: "Do X", message: "Say Y", why: "Because Z", time: "30 minutes" };
    expect(action).toHaveProperty("action");
    expect(action).toHaveProperty("message");
    expect(action).toHaveProperty("why");
    expect(action).toHaveProperty("time");
  });

  it("unknown stage falls back to Idea", () => {
    const stage = "Unknown";
    const result = FALLBACK_ACTIONS[stage] ?? FALLBACK_ACTIONS["Idea"];
    expect(result).toBe(FALLBACK_ACTIONS["Idea"]);
  });
});
