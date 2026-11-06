import { describe, it, expect } from "vitest";
import { liveAllowedFor, makeSeed, seedIsFresh } from "@/lib/break/frontDoor";
import { SAMPLES } from "@/components/break/SampleOutputs";

describe("front door", () => {
  it("live run needs an account unless reopened", () => {
    expect(liveAllowedFor(false, undefined)).toBe(false);
    expect(liveAllowedFor(false, "closed")).toBe(false);
    expect(liveAllowedFor(false, "open")).toBe(true);
    expect(liveAllowedFor(true, undefined)).toBe(true);
  });
  it("a saved seed keeps the advice, trimmed, and expires after 14 days", () => {
    const now = new Date("2026-11-05T00:00:00Z");
    const s = makeSeed("  my   idea ", "  Talk to   five customers. ", now)!;
    expect(s).toMatchObject({ idea: "my idea", advice: "Talk to five customers." });
    expect(seedIsFresh(s, new Date("2026-11-18T00:00:00Z"))).toBe(true);
    expect(seedIsFresh(s, new Date("2026-11-20T00:00:00Z"))).toBe(false);
    expect(makeSeed("x", "   ")).toBeNull();
    expect(seedIsFresh(null)).toBe(false);
  });
  it("samples carry no score and no real brand", () => {
    for (const s of SAMPLES) expect(JSON.stringify(s)).not.toMatch(/\d+\s?%|survival/i);
  });
});
