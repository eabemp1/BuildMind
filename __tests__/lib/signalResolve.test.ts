import { describe, it, expect } from "vitest";
import { resolveSignal, strongestObserved } from "@/lib/signalResolve";

const claim = (kind: any, count = 1) => ({ kind, count, trust: "self" as const });

describe("strongestObserved", () => {
  it("picks the strongest kind, then the biggest count", () => {
    expect(strongestObserved([{ kind: "visit", count: 40, source: "link" }, { kind: "signup", count: 1, source: "page" }])?.kind).toBe("signup");
    expect(strongestObserved([{ kind: "payment", count: 1, source: "stripe" }, { kind: "signup", count: 9, source: "page" }])?.kind).toBe("payment");
    expect(strongestObserved([])).toBeNull();
    expect(strongestObserved([{ kind: "visit", count: 0, source: "link" }])).toBeNull();
  });
});

describe("resolveSignal", () => {
  it("a typed claim with no proof and nothing observed stays self (unverified)", () => {
    expect(resolveSignal({ claimed: claim("reply", 50), proofOk: false, observed: null })).toMatchObject({ source: "founder", signal: { kind: "reply", trust: "self" } });
  });
  it("proof upgrades the claim", () => {
    expect(resolveSignal({ claimed: claim("reply"), proofOk: true, observed: null })?.signal.trust).toBe("proof");
  });
  it("an observation beats a typed claim, even a bigger one", () => {
    const r = resolveSignal({ claimed: claim("payment", 500), proofOk: false, observed: { kind: "visit", count: 4, source: "link" } });
    expect(r).toMatchObject({ source: "auto", signal: { kind: "visit", count: 4, trust: "verified" } });
    expect(r?.note).toContain("tracked link");
  });
  it("an observation beats the founder saying nothing happened", () => {
    expect(resolveSignal({ claimed: claim("none", 0), proofOk: false, observed: { kind: "signup", count: 2, source: "page" } })?.source).toBe("auto");
  });
  it("a stronger proved claim beats a weaker observation", () => {
    const r = resolveSignal({ claimed: claim("call"), proofOk: true, observed: { kind: "visit", count: 5, source: "link" } });
    expect(r).toMatchObject({ source: "founder", signal: { kind: "call", trust: "proof" } });
  });
  it("a weaker proved claim does not beat a stronger observation", () => {
    expect(resolveSignal({ claimed: claim("reply"), proofOk: true, observed: { kind: "payment", count: 1, source: "stripe" } })?.source).toBe("auto");
  });
  it("nothing claimed and nothing observed gives nothing", () => {
    expect(resolveSignal({ claimed: null, proofOk: false, observed: null })).toBeNull();
  });
  it("claiming none stays an honest none", () => {
    expect(resolveSignal({ claimed: claim("none", 0), proofOk: false, observed: null })?.signal.kind).toBe("none");
  });
});
