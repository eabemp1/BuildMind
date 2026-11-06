import { describe, it, expect } from "vitest";
import { pickSlot, statusLine, slotAllowed, type SlotCandidate } from "@/lib/today/slot";

const c = (kind: SlotCandidate["kind"], id = `${kind}:1`): SlotCandidate => ({ id, kind, text: kind, href: "/x", cta: "Go" });
const now = new Date("2026-11-05T10:00:00Z");

describe("pickSlot", () => {
  it("market change beats risk beats stage", () => {
    expect(pickSlot([c("stage"), c("risk"), c("market")], {}, now)?.kind).toBe("market");
    expect(pickSlot([c("stage"), c("risk")], {}, now)?.kind).toBe("risk");
  });
  it("returns nothing on a quiet day", () => expect(pickSlot([], {}, now)).toBeNull());
  it("skips a dismissed fact for three days, then shows it again", () => {
    const d = { "market:1": "2026-11-04T10:00:00Z" };
    expect(pickSlot([c("market"), c("risk")], d, now)?.kind).toBe("risk");
    expect(pickSlot([c("market")], { "market:1": "2026-11-01T10:00:00Z" }, now)?.kind).toBe("market");
  });
  it("a new week's change is a new fact", () => {
    expect(pickSlot([c("market", "market:2")], { "market:1": now.toISOString() }, now)?.id).toBe("market:2");
  });
});

describe("statusLine and gating", () => {
  it("only shows what is known", () => {
    expect(statusLine({})).toBe("");
    expect(statusLine({ stage: { filled: 2, total: 4, next: "MVP" }, pmf: { observed: 1, total: 6 }, pace: { dated: 3, behind: 1 } })).toBe("Evidence for MVP 2/4 · PMF signs 1/6 · Pace: 1 behind");
    expect(statusLine({ pace: { dated: 2, behind: 0 } })).toBe("Pace: on track");
    expect(statusLine({ pace: { dated: 0, behind: 0 } })).toBe("");
  });
  it("drained and recovery days show nothing", () => {
    expect(slotAllowed("low", false)).toBe(false);
    expect(slotAllowed("normal", true)).toBe(false);
    expect(slotAllowed(null, false)).toBe(true);
  });
});
