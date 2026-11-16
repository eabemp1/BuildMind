import { describe, it, expect } from "vitest";
import { tickerItems, nextIndex, MAX_TICKER_ITEMS } from "@/lib/today/ticker";
import type { SlotCandidate } from "@/lib/today/slot";

const c = (id: string, kind: SlotCandidate["kind"]): SlotCandidate => ({ id, kind, text: `t-${id}`, href: "/x", cta: "Open" });
const base = { dismissed: {}, progress: "", now: new Date("2026-11-16T10:00:00Z") };

describe("tickerItems", () => {
  it("is empty on a quiet day", () => expect(tickerItems({ ...base, candidates: [] })).toEqual([]));
  it("orders by the existing slot rule, then radar, then progress", () => {
    const out = tickerItems({ ...base, candidates: [c("m", "market"), c("s", "stage"), c("b", "back")], progress: "PMF signs 1/6", radar: { text: "Radar watching", href: "/radar", cta: "Open" } });
    expect(out.map((x) => x.kind)).toEqual(["back", "market", "stage", "radar", "progress"]);
  });
  it("hides a dismissed fact for three days only", () => {
    const cands = [c("m1", "market")];
    expect(tickerItems({ ...base, candidates: cands, dismissed: { m1: "2026-11-15T10:00:00Z" } })).toEqual([]);
    expect(tickerItems({ ...base, candidates: cands, dismissed: { m1: "2026-11-10T10:00:00Z" } })).toHaveLength(1);
  });
  it("radar and progress cannot be dismissed, facts can", () => {
    const out = tickerItems({ ...base, candidates: [c("m", "market")], progress: "x", radar: { text: "r", href: "/radar", cta: "Open" } });
    expect(out.map((x) => x.dismissible)).toEqual([true, false, false]);
  });
  it("caps the list", () => {
    const many = Array.from({ length: 12 }, (_, i) => c(`m${i}`, "market"));
    expect(tickerItems({ ...base, candidates: many })).toHaveLength(MAX_TICKER_ITEMS);
  });
});
describe("nextIndex", () => {
  it("wraps and handles tiny lists", () => { expect(nextIndex(2, 3)).toBe(0); expect(nextIndex(0, 1)).toBe(0); expect(nextIndex(0, 0)).toBe(0); });
});
