import { describe, it, expect } from "vitest";
import { rollingPlan } from "@/lib/experimentPlan";
import { nextMove, tally, type Experiment, type ExperimentEvent } from "@/lib/experiments";

const start = "2026-11-01T00:00:00Z";
const day = (n: number) => new Date(Date.parse(start) + n * 86_400_000).toISOString();
const ev = (who: string, kind: ExperimentEvent["kind"], at: string): ExperimentEvent => ({ who, kind, detail: "", created_at: at });
const exp = (events: ExperimentEvent[], over: Partial<Experiment> = {}): Experiment => ({ id: "1", goal: "Do shops care?", hypothesis: "", audience: "", plan: "", status: "running", decision: null, decision_note: "", created_at: start, updated_at: start, events, ...over });

describe("rollingPlan", () => {
  it("starts with nothing ticked and a first step", () => {
    const p = rollingPlan(exp([]), Date.parse(day(0)) + 3600_000);
    expect(p.day).toBe(1);
    expect(p.milestones.every((m) => !m.done)).toBe(true);
    expect(p.next[0]).toMatch(/five people/);
  });
  it("ticks only what the founder confirmed, with the date it happened", () => {
    const events = ["A", "B", "C", "D", "E"].map((w, i) => ev(w, "sent", day(i + 1))).concat([ev("A", "replied", day(7))]);
    const p = rollingPlan(exp(events), Date.parse(day(8)));
    expect(p.milestones.find((m) => m.id === "ask5")?.done).toBe(true);
    expect(p.milestones.find((m) => m.id === "reply1")?.at).toBe(day(7));
    expect(p.milestones.find((m) => m.id === "willing")?.done).toBe(false);
  });
  it("prepared does not count as asking", () => {
    const p = rollingPlan(exp(["A", "B", "C", "D", "E"].map((w) => ev(w, "prepared", day(1)))), Date.parse(day(2)));
    expect(p.milestones.find((m) => m.id === "ask5")?.done).toBe(false);
  });
  it("adapts: the next step changes when someone says they would pay", () => {
    const p = rollingPlan(exp([ev("A", "sent", day(1)), ev("A", "would_pay", day(2))]), Date.parse(day(3)));
    expect(p.next[0]).toMatch(/small pilot/);
  });
  it("a quiet week is allowed and says so without nagging or inventing", () => {
    const p = rollingPlan(exp([ev("A", "sent", day(1))]), Date.parse(day(12)));
    expect(p.quiet?.note).toMatch(/That is fine/);
    expect(p.next.length).toBeLessThanOrEqual(3);
  });
  it("after 30 days it asks for a decision", () => {
    const p = rollingPlan(exp([]), Date.parse(day(31)));
    expect(p.windowOver).toBe(true);
    expect(p.summary).toMatch(/Make a decision/);
  });
  it("a decided experiment shows no quiet warning", () => expect(rollingPlan(exp([], { status: "decided", decision: "stop" }), Date.parse(day(20))).quiet).toBeNull());
});
describe("paid beats would-pay in nextMove", () => {
  it("says so", () => expect(nextMove(tally([ev("A", "paid", day(1))])).headline).toMatch(/paid/));
});
