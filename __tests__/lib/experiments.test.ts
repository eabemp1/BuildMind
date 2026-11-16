import { describe, it, expect } from "vitest";
import { experimentBlock, nextMove, parseEvent, parseNewExperiment, receipts, tally, type ExperimentEvent, type Experiment } from "@/lib/experiments";

const ev = (who: string, kind: ExperimentEvent["kind"], at: string, detail = ""): ExperimentEvent => ({ who, kind, detail, created_at: at });

describe("parsing", () => {
  it("needs a real goal", () => { expect(parseNewExperiment({ goal: "hi" }).ok).toBe(false); expect(parseNewExperiment({ goal: "Do shops care about missed bookings?" }).ok).toBe(true); });
  it("an event needs a kind, and a person unless it is a note", () => {
    expect(parseEvent({ kind: "sent" }).ok).toBe(false);
    expect(parseEvent({ kind: "nope", who: "A" }).ok).toBe(false);
    expect(parseEvent({ kind: "note", detail: "x" }).ok).toBe(true);
    expect(parseEvent({ kind: "sent", who: " Ama " })).toEqual({ ok: true, value: { who: "Ama", kind: "sent", detail: "" } });
  });
});
describe("receipts", () => {
  it("keeps the latest confirmed state per person, case-insensitive", () => {
    const r = receipts([ev("Ama", "prepared", "2026-11-01"), ev("ama", "sent", "2026-11-02"), ev("Kofi", "blocked", "2026-11-03", "no number")]);
    expect(r.find((x) => x.who.toLowerCase() === "ama")?.state).toBe("sent");
    expect(r).toHaveLength(2);
  });
  it("notes are not people", () => expect(receipts([ev("", "note", "2026-11-01", "thinking")])).toEqual([]));
});
describe("nextMove", () => {
  const t = (events: ExperimentEvent[]) => nextMove(tally(events));
  it("starts with five people", () => expect(t([]).headline).toMatch(/five people/));
  it("prepared is not sent", () => expect(t([ev("A", "prepared", "1")]).why).toMatch(/Nothing has reached anyone/));
  it("five silent contacts: change one thing, and silence is not read as no interest", () => {
    const e = ["A", "B", "C", "D", "E"].map((w, i) => ev(w, "sent", `${i}`));
    const m = t(e);
    expect(m.headline).toMatch(/Change one thing/);
    expect(m.why).toMatch(/does not mean no interest/);
  });
  it("a reply beats everything", () => expect(t([ev("A", "sent", "1"), ev("A", "replied", "2")]).headline).toMatch(/replied/));
});
describe("experimentBlock", () => {
  const e: Experiment = { id: "1", goal: "Do shops care?", hypothesis: "", audience: "Kumasi shops", plan: "", status: "running", decision: null, decision_note: "", created_at: "", updated_at: "", events: [ev("A", "prepared", "1")] };
  it("states counts and forbids claiming contact that was not confirmed", () => {
    const b = experimentBlock(e);
    expect(b).toContain("Prepared: 1");
    expect(b).toContain("Sent: 0");
    expect(b).toMatch(/unless it says Sent/);
  });
  it("is empty without an experiment", () => expect(experimentBlock(null)).toBe(""));
});
