import { describe, it, expect } from "vitest";
import { COACH_GROUNDING_RULE } from "@/lib/coachGrounding";
import { readFileSync } from "node:fs";

describe("coach grounding", () => {
  it("forbids invented durations and counts", () => {
    expect(COACH_GROUNDING_RULE).toMatch(/duration, count, percentage or date/);
  });
  it("is wired into the coach prompt and the invented-percentage example is gone", () => {
    const src = readFileSync("app/api/ai/coach/route.ts", "utf8");
    expect(src).toContain("${COACH_GROUNDING_RULE}");
    expect(src).not.toContain("80% of the time");
  });
});

import { unsupportedFigures, withFigureNote } from "@/lib/coachGrounding";

describe("figure check", () => {
  it("flags a figure that is not in the context", () => {
    expect(unsupportedFigures("No outreach in 14 days.", "Last reflection 2 days ago")).toEqual(["14 days"]);
  });
  it("accepts a figure that is in the context", () => {
    expect(unsupportedFigures("You skipped it for 14 days.", "streak broke 14 days ago")).toEqual([]);
  });
  it("adds a caveat only when something is unsupported, and not when sources are cited", () => {
    expect(withFigureNote("Fine.", "x")).toBe("Fine.");
    expect(withFigureNote("About 30% fail.", "x")).toMatch(/treat that as my guess/);
    expect(withFigureNote("About 30% fail.", "x", true)).toBe("About 30% fail.");
  });
});

import { COACH_TEST_RULE } from "@/lib/coachGrounding";
describe("coach test-data rule", () => {
  it("is wired into the prompt and bans reading test activity as behaviour", () => {
    expect(COACH_TEST_RULE).toMatch(/Do not call preparing or drafting/);
    expect(readFileSync("app/api/ai/coach/route.ts", "utf8")).toContain("${COACH_TEST_RULE}");
  });
});
