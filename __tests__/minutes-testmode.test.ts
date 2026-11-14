import { describe, expect, it } from "vitest";
import { taskMinutes } from "@/lib/today/minutes";
import { parseTestMode, testModeRule } from "@/lib/testMode";

describe("taskMinutes cap", () => {
  it("trims the task type's default to the daily limit", () => {
    expect(taskMinutes("Find one shop on Google Maps.", 60, 30)).toBe(30);
  });
  it("keeps a time the sentence states, so label and text agree", () => {
    expect(taskMinutes("Spend 45 minutes finding shops.", 60, 30)).toBe(45);
  });
  it("ignores an empty cap", () => {
    expect(taskMinutes("Find one shop.", 60, null)).toBe(60);
  });
});

describe("test mode", () => {
  it("is off unless explicitly on", () => {
    expect(parseTestMode(null).on).toBe(false);
    expect(parseTestMode({ on: "yes" }).on).toBe(false);
    expect(parseTestMode({ on: true }).on).toBe(true);
  });
  it("only adds a rule when on", () => {
    expect(testModeRule(false)).toBe("");
    expect(testModeRule(true)).toMatch(/TEST MODE/);
  });
});

import { spendsAgainstBudget } from "@/lib/constraints";
import { fallbackForKind } from "@/lib/todayFallbacks";

describe("zero budget", () => {
  const zero = { minutesPerDay: null, monthlyBudget: 0 };
  it("flags tasks that spend money", () => {
    for (const t of ["Run a Facebook ad for your repair shop.", "Boost your post with $5.", "Buy a premium plan for the tool.", "Set up a paid promotion."]) {
      expect(spendsAgainstBudget(t, zero)).toBe(true);
    }
  });
  it("passes free tasks, and anyone who set a real or no budget", () => {
    expect(spendsAgainstBudget("Message 5 shops on Facebook.", zero)).toBe(false);
    expect(spendsAgainstBudget("Run a Facebook ad.", { minutesPerDay: null, monthlyBudget: 50 })).toBe(false);
    expect(spendsAgainstBudget("Run a Facebook ad.", null)).toBe(false);
  });
  it("no built-in fallback task asks for spending", () => {
    const input = { userType: "bike shop owners", problemDesc: "tracking repairs", productName: "RepairBoard", stage: "Validation" };
    for (const kind of ["interview", "outreach", "follow_up", "build", "unblock"] as const) {
      for (const seed of ["a", "b", "c", "d"]) expect(spendsAgainstBudget(fallbackForKind(kind, input, seed).action, zero)).toBe(false);
    }
  });
});
