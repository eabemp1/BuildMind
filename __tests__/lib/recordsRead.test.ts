import { describe, it, expect } from "vitest";
import { recordsRead } from "@/lib/coachContext";
const none = { hasRecentReflections: false, hasCompletionPattern: false, hasMomentumData: false, hasSkipReasons: false, hasBlockerInsight: false, hasMemoryData: false };
describe("recordsRead", () => {
  it("lists only what was read", () => expect(recordsRead({ ...none, hasRecentReflections: true })).toEqual(["Read your latest reflections"]));
  it("says so when nothing was found", () => expect(recordsRead(none)[0]).toMatch(/Found no reflections/));
});
