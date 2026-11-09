import { describe, it, expect } from "vitest";
import { deriveFounderState, stateNote } from "@/lib/founderState";

const H = 3_600_000;
describe("energy check window", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  it("a check from 10 hours ago still counts as fresh self-report", () => {
    const s = deriveFounderState({ now, localHour: 12, selfReport: { level: "low", at: new Date(now - 10 * H).toISOString() } });
    expect(s.level).toBe("low");
  });
  it("is not late at midday, and is late at 1am", () => {
    expect(stateNote(deriveFounderState({ now, localHour: 11 }))).toBeNull();
    expect(stateNote(deriveFounderState({ now, localHour: 1 }))).toMatch(/late/i);
  });
});
