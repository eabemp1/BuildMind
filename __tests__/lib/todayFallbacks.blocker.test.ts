import { describe, it, expect } from "vitest";
import { fallbackForKind } from "@/lib/todayFallbacks";
import { fitMissionToState } from "@/lib/founderState";

const input = { userType: "bike shop owners", problemDesc: "tracking repairs", productName: "RepairBoard", stage: "Validation" };

describe("blocked yesterday", () => {
  it("unblock fallback names the blocker instead of repeating the ask", () => {
    const f = fallbackForKind("unblock", { ...input, blocker: "I don't know any bike shop owners." }, "seed");
    expect(f.action).toContain("I don't know any bike shop owners");
    expect(f.action).not.toMatch(/call one/i);
  });
  it("not knowing anyone leads to finding people, not a brainstorm or another call", () => {
    for (const b of ["I don't know any bike shop owners.", "I know nobody in this business", "no contacts yet"]) {
      const f = fallbackForKind("unblock", { ...input, blocker: b }, "seed");
      expect(f.action).toMatch(/find them/);
      expect(f.action).toContain("bike shop owners");
      expect(f.action).not.toMatch(/call one/i);
    }
  });
  it("other blockers still get the general way-around task", () => {
    expect(fallbackForKind("unblock", { ...input, blocker: "I ran out of time" }, "seed").action).toMatch(/3 ways around/);
  });
  it("without a blocker the generic unblock task is unchanged", () => {
    expect(fallbackForKind("unblock", input, "seed").action).not.toContain("got stuck");
  });
  it("low-energy note says what it is based on", () => {
    const state = { level: "low", score: 55, load: "autopilot", source: "inferred", confidence: 0.4, reasons: ["It's the middle of the night where you are."], lateNight: true, holdBigDecisions: true, maxMinutes: 25, effortCap: 1 } as never;
    const m = { kind: "interview", minutes: 45, scores: {}, reasons: [], label: "", requires: [], shape: "" } as never;
    const out = fitMissionToState(m, state);
    expect(out.reasons[0]).toMatch(/middle of the night/);
  });
});
