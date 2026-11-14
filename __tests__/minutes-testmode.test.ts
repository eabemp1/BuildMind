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
