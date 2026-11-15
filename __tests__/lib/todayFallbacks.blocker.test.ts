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

import { assumesContact, lacksContacts } from "@/lib/todayFallbacks";

describe("a founder who knows no one", () => {
  it("is detected from the latest blockers only", () => {
    expect(lacksContacts(["I don't know any bike-shop owners.", "x"])).toMatch(/don't know/);
    expect(lacksContacts(["fine", "fine", "fine", "I know nobody"])).toBeNull();
    expect(lacksContacts(undefined)).toBeNull();
  });
  it("recognises tasks that send them to someone they know", () => {
    expect(assumesContact("Call one bike shop you know and ask about missed pickups.")).toBe(true);
    expect(assumesContact("Message 3 friends who ride bikes.")).toBe(true);
    expect(assumesContact("Find 5 bike shops on Google Maps and note each phone number.")).toBe(false);
  });
  it("no fallback for any kind sends them to someone they know", () => {
    const input = { userType: "independent bike shops", problemDesc: "missed pickups", productName: "RepairBoard", stage: "Validation", blocker: "I don't know any bike shop owners." };
    for (const kind of ["interview", "outreach", "follow_up", "build", "unblock", "reset"] as const) {
      for (const seed of ["a", "b", "c", "d", "e"]) {
        const f = fallbackForKind(kind, input, seed);
        expect(assumesContact(`${f.action} ${f.first_step}`), `${kind}/${seed}: ${f.action}`).toBe(false);
      }
    }
  });
});
