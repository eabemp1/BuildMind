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
