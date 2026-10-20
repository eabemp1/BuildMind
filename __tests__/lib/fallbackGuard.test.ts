import { describe, it, expect } from "vitest";
import { buildLedger } from "@/lib/today/facts";
import { fallbackForKind } from "@/lib/todayFallbacks";
import { guardRules } from "@/lib/today/rules";

describe("fallback respects the founder's facts", () => {
  const ledger = buildLedger([{ created_at: "2026-10-16T10:00:00Z", what_tried: "", blocker: "I don't have beta users", what_learned: "" } as never]);
  it("never returns a task the guard would reject", () => {
    for (const kind of ["interview", "outreach", "follow_up", "publish", "pricing", "reset"] as const) {
      for (const seed of ["a", "b", "c", "d"]) {
        const f = fallbackForKind(kind, { userType: "beta founders", problemDesc: "retaining users", productName: "App", stage: "Idea" }, seed, ledger);
        expect(guardRules(`${f.action} ${f.first_step}`, ledger, f.message)).toEqual([]);
      }
    }
  });
});

import { findContradictions } from "@/lib/today/facts";
describe("generic user contact", () => {
  const L = buildLedger([{ created_at: "2026-10-16T10:00:00Z", what_tried: "", blocker: "I don't have beta users", what_learned: "" } as never]);
  it("flags DM-ing 'users' but not recruiting them", () => {
    expect(findContradictions("DM 3 users on Discord about the product", L).length).toBe(1);
    expect(findContradictions("Find 5 new users in a founders community", L).length).toBe(0);
  });
  it("carries the founder's own first move", () => {
    const T = buildLedger([{ created_at: new Date().toISOString(), what_tried: "", what_learned: "Tomorrow's first move: cold email startup advisors" } as never]);
    expect(T.facts.some((f) => f.kind === "direction" && /advisors/.test(f.rule))).toBe(true);
  });
});

import { moodFor } from "@/lib/today/mood";
describe("mood", () => {
  it("maps every mission kind and falls back to the prep kind", () => {
    expect(moodFor("outreach")).toBe("people");
    expect(moodFor("build")).toBe("build");
    expect(moodFor(null, "pricing_test")).toBe("pricing");
    expect(moodFor(undefined, "action_plan")).toBe("default");
  });
});
