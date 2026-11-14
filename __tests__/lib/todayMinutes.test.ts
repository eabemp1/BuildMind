import { describe, it, expect } from "vitest";
import { statedMinutes, taskMinutes } from "@/lib/today/minutes";
import { parseSuggestedMinutes } from "@/lib/todayFocus";

describe("one time for the task", () => {
  it("uses the single number the sentence states", () => {
    expect(statedMinutes("Spend 30 minutes finding one bike shop's phone number.")).toBe(30);
    expect(taskMinutes("Spend 30 minutes finding one bike shop's phone number.", 60)).toBe(30);
  });
  it("falls back to the task type when the sentence states none or several", () => {
    expect(taskMinutes("Find one bike shop's phone number.", 45)).toBe(45);
    expect(taskMinutes("Spend 15 minutes finding a shop, then 20 minutes writing the ask.", 45)).toBe(45);
  });
  it("a daily limit caps it", () => {
    expect(taskMinutes("Interview two shop owners.", 60, 30)).toBe(30);
  });
  it("a range starts the focus timer at the low end", () => {
    expect(parseSuggestedMinutes("30-60 minutes")).toBe(30);
    expect(parseSuggestedMinutes("1–2 hours")).toBe(60);
  });
});

import { summarizeReflection } from "@/lib/today/reflectionSummary";
describe("reflection summary", () => {
  it("quotes the blocker and the date", () => {
    const s = summarizeReflection({ outcome: "blocked", blocker: "I don't know any bike shop owners", created_at: "2026-11-13T10:00:00Z" });
    expect(s).toMatch(/^Blocked on 13 Nov: "I don't know any bike shop owners"$/);
  });
  it("falls back to the note and truncates long text", () => {
    const s = summarizeReflection({ outcome: "partial", note: "x".repeat(300) });
    expect(s.startsWith('Partly done: "')).toBe(true);
    expect(s.length).toBeLessThan(160);
  });
});
