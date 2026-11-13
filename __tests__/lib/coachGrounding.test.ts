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
