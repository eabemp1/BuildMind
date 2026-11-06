import { describe, it, expect } from "vitest";
import { buildPmfRungs, buildPmfVisual } from "@/lib/pmf/ladder";

const base = { people: [], outcomes: [], revenue: [], search: null };
const state = (r: ReturnType<typeof buildPmfRungs>, id: string) => r.find((x) => x.id === id)?.state;

describe("PMF ladder", () => {
  it("empty record: two not yet, four not measured, nothing observed", () => {
    const r = buildPmfRungs(base);
    expect(r.filter((x) => x.state === "observed")).toHaveLength(0);
    expect(state(r, "paid")).toBe("not_measured");
    expect(state(r, "found")).toBe("not_measured");
    expect(state(r, "return")).toBe("not_measured");
  });
  it("needs five finished conversations", () => {
    const four = Array.from({ length: 4 }, () => ({ status: "done" }));
    expect(state(buildPmfRungs({ ...base, people: four }), "confirmed")).toBe("not_yet");
    expect(state(buildPmfRungs({ ...base, people: [...four, { status: "done" }] }), "confirmed")).toBe("observed");
  });
  it("replies count from people or logged outcomes", () => {
    expect(state(buildPmfRungs({ ...base, people: [{ status: "booked" }] }), "acted")).toBe("observed");
    expect(state(buildPmfRungs({ ...base, outcomes: ["call_booked"] }), "acted")).toBe("observed");
    expect(state(buildPmfRungs({ ...base, people: [{ status: "sent" }] }), "acted")).toBe("not_yet");
  });
  it("test-mode payments never count", () => {
    const test = { provider: "stripe", mode: "test" as const, payingCustomers: 3, paymentsLast30d: 3 };
    expect(state(buildPmfRungs({ ...base, revenue: [test] }), "paid")).toBe("not_yet");
    expect(state(buildPmfRungs({ ...base, revenue: [{ ...test, mode: "live" }] }), "paid")).toBe("observed");
  });
  it("search: connected with zero clicks is not yet, not connected is not measured", () => {
    expect(state(buildPmfRungs({ ...base, search: { clicks: 0 } }), "found")).toBe("not_yet");
    expect(state(buildPmfRungs({ ...base, search: { clicks: 12 } }), "found")).toBe("observed");
  });
  it("visual has no score and a count summary", () => {
    const { visual, summary } = buildPmfVisual({ ...base, outcomes: ["replied"] });
    expect(summary).toEqual({ observed: 1, total: 6, notMeasured: 4 });
    expect(JSON.stringify(visual)).toContain("1 of 6 observed");
    expect(visual.panels.some((p) => p.type === "gauge")).toBe(false);
  });
});
