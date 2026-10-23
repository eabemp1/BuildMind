import { describe, expect, it } from "vitest";
import { describeSignal, parseOutcomeSignal, scoreStructuredOutcome, signalProducedEvidence } from "../../lib/outcomeSignal";

describe("parseOutcomeSignal", () => {
  it("rejects junk", () => {
    expect(parseOutcomeSignal(null)).toBeNull();
    expect(parseOutcomeSignal("reply")).toBeNull();
    expect(parseOutcomeSignal({ kind: "banana", count: 2 })).toBeNull();
    expect(parseOutcomeSignal({ count: 2 })).toBeNull();
  });
  it("none always has count 0", () => {
    expect(parseOutcomeSignal({ kind: "none", count: 7 })).toEqual({ kind: "none", count: 0, trust: "self" });
  });
  it("clamps and floors counts, defaults to 1", () => {
    expect(parseOutcomeSignal({ kind: "reply", count: 2.9 })).toEqual({ kind: "reply", count: 2, trust: "self" });
    expect(parseOutcomeSignal({ kind: "reply", count: 0 })).toEqual({ kind: "reply", count: 1, trust: "self" });
    expect(parseOutcomeSignal({ kind: "reply", count: -5 })).toEqual({ kind: "reply", count: 1, trust: "self" });
    expect(parseOutcomeSignal({ kind: "reply" })).toEqual({ kind: "reply", count: 1, trust: "self" });
    expect(parseOutcomeSignal({ kind: "signup", count: 99999999 })).toEqual({ kind: "signup", count: 9999, trust: "self" });
    expect(parseOutcomeSignal({ kind: "signup", count: "abc" })).toEqual({ kind: "signup", count: 1, trust: "self" });
  });
});

describe("scoreStructuredOutcome", () => {
  it("a completed task that produced nothing does not clear the 0.5 bar", () => {
    expect(scoreStructuredOutcome(true, { kind: "none", count: 0, trust: "verified" })).toBeLessThan(0.5);
  });
  it("a completed task with any real signal clears the bar", () => {
    for (const kind of ["reply", "conversation", "signup", "call", "payment", "other"] as const) {
      expect(scoreStructuredOutcome(true, { kind, count: 1, trust: "verified" })).toBeGreaterThanOrEqual(0.5);
    }
  });
  it("stronger signals score higher", () => {
    const s = (kind: any) => scoreStructuredOutcome(true, { kind, count: 1, trust: "verified" });
    expect(s("payment")).toBeGreaterThan(s("call"));
    expect(s("call")).toBeGreaterThan(s("signup"));
    expect(s("signup")).toBeGreaterThan(s("reply"));
    expect(s("reply")).toBeGreaterThan(s("other"));
  });
  it("volume adds a small bonus and never exceeds 1", () => {
    expect(scoreStructuredOutcome(true, { kind: "reply", count: 5, trust: "verified" })).toBeGreaterThan(scoreStructuredOutcome(true, { kind: "reply", count: 1, trust: "verified" }));
    expect(scoreStructuredOutcome(true, { kind: "payment", count: 50, trust: "verified" })).toBe(1);
  });
  it("an unfinished task that still produced a signal gets partial credit; none gets almost nothing", () => {
    const done = scoreStructuredOutcome(true, { kind: "call", count: 1, trust: "verified" });
    const part = scoreStructuredOutcome(false, { kind: "call", count: 1, trust: "verified" });
    expect(part).toBeLessThan(done);
    expect(part).toBeGreaterThan(0.5);
    expect(scoreStructuredOutcome(false, { kind: "none", count: 0, trust: "verified" })).toBeLessThan(0.2);
  });
  it("is always within 0..1", () => {
    for (const kind of ["none", "reply", "conversation", "signup", "call", "payment", "other"] as const) {
      for (const completed of [true, false]) {
        const v = scoreStructuredOutcome(completed, { kind, count: kind === "none" ? 0 : 3 });
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("helpers", () => {
  it("signalProducedEvidence", () => {
    expect(signalProducedEvidence(null)).toBe(false);
    expect(signalProducedEvidence({ kind: "none", count: 0 })).toBe(false);
    expect(signalProducedEvidence({ kind: "reply", count: 2 })).toBe(true);
  });
  it("describeSignal reads naturally", () => {
    expect(describeSignal({ kind: "none", count: 0 })).toBe("Produced nothing yet");
    expect(describeSignal({ kind: "reply", count: 1 })).toBe("Produced a reply (unverified)");
    expect(describeSignal({ kind: "signup", count: 3 })).toBe("Produced 3 x signup (unverified)");
  });
});

import { isUnproven, UNPROVEN_SCORE } from "../../lib/outcomeSignal";

describe("trust: typed numbers cannot inflate the score", () => {
  it("an unbacked claim never reaches the 0.5 success bar, however big the number", () => {
    for (const kind of ["reply", "conversation", "signup", "call", "payment", "visit", "other"] as const) {
      expect(scoreStructuredOutcome(true, { kind, count: 9999 })).toBe(UNPROVEN_SCORE);
      expect(scoreStructuredOutcome(true, { kind, count: 9999, trust: "self" })).toBeLessThan(0.5);
    }
  });
  it("proof counts but never as much as something BuildMind observed", () => {
    const proof = scoreStructuredOutcome(true, { kind: "payment", count: 1, trust: "proof" });
    const verified = scoreStructuredOutcome(true, { kind: "payment", count: 1, trust: "verified" });
    expect(proof).toBeGreaterThanOrEqual(0.5);
    expect(proof).toBeLessThan(verified);
  });
  it("a couple of visitors is not a signal, a small crowd is", () => {
    expect(scoreStructuredOutcome(true, { kind: "visit", count: 2, trust: "verified" })).toBeLessThan(0.5);
    expect(scoreStructuredOutcome(true, { kind: "visit", count: 3, trust: "verified" })).toBeGreaterThanOrEqual(0.5);
  });
  it("trust is never read from the request", () => {
    expect(parseOutcomeSignal({ kind: "payment", count: 3, trust: "verified" })?.trust).toBe("self");
  });
  it("admitting nothing is honest, not unproven", () => {
    expect(isUnproven({ kind: "none", count: 0 })).toBe(false);
    expect(isUnproven({ kind: "reply", count: 1 })).toBe(true);
    expect(isUnproven({ kind: "reply", count: 1, trust: "proof" })).toBe(false);
  });
});
