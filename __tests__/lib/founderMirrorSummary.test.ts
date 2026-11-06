import { describe, it, expect } from "vitest";
import { summaryInput, hasEnough, inputKey, summaryPrompt, normalizeSummary } from "@/lib/founderMirrorSummary";

const mirror = { beliefs: [{ belief: "You start strong and stall on outreach" }, { belief: "Evenings are your best work time" }, { belief: 5 }], strengthening_patterns: ["Shipping small"], weakening_patterns: [], recent_changes: [], may_be_wrong_about: ["Outreach may be avoided only this month"] };

describe("mirror summary", () => {
  it("keeps only text, capped", () => {
    const i = summaryInput({ ...mirror, beliefs: Array.from({ length: 20 }, (_, n) => ({ belief: `b${n}` })) });
    expect(i.beliefs).toHaveLength(6);
    expect(summaryInput(null)).toEqual({ beliefs: [], strengthening: [], weakening: [], recent: [], mayBeWrong: [] });
    expect(summaryInput(mirror).beliefs).toHaveLength(2);
  });
  it("needs at least two beliefs", () => {
    expect(hasEnough(summaryInput(mirror))).toBe(true);
    expect(hasEnough(summaryInput({ beliefs: [{ belief: "one" }] }))).toBe(false);
  });
  it("cache key changes only when the content changes", () => {
    const a = inputKey(summaryInput(mirror));
    expect(inputKey(summaryInput(JSON.parse(JSON.stringify(mirror))))).toBe(a);
    expect(inputKey(summaryInput({ ...mirror, recent_changes: ["new"] }))).not.toBe(a);
  });
  it("prompt forbids invention and diagnosis", () => {
    const p = summaryPrompt(summaryInput(mirror));
    expect(p).toMatch(/only what is listed/i);
    expect(p).toMatch(/do not diagnose/i);
    expect(p).toContain("Outreach may be avoided");
  });
  it("rejects too-short or malformed output", () => {
    expect(normalizeSummary({ summary: "ok" })).toBeNull();
    expect(normalizeSummary(null)).toBeNull();
    expect(normalizeSummary({ summary: "You start strong, and outreach is where momentum drops. Evenings look like your best time." })).toContain("You start strong");
  });
});
