import { describe, it, expect } from "vitest";
import { weighEvidence } from "@/lib/evidenceWeigh";
import { zoneWords, zoneMatchesActions } from "@/lib/avoidanceMatch";

const face = (text: string, extra: Partial<Parameters<typeof weighEvidence>[0]> = {}) =>
  weighEvidence({ kind: "avoidance_faced", claim: "Visibility", text, relatedWords: zoneWords("Visibility"), ...extra });

describe("avoidance: I faced this", () => {
  it("rejects bare claims", () => {
    for (const t of ["done", "I did it", "yes", "trust me", ""]) expect(face(t).verdict).toBe("needs_more");
  });
  it("rejects a vague account with nothing observed", () => {
    expect(face("I thought about posting more and tried to be better").verdict).not.toBe("accepted");
  });
  it("accepts a specific, relevant account", () => {
    const w = face("Posted my launch thread on LinkedIn and Reddit, got 3 comments and 40 views");
    expect(w.verdict).toBe("accepted");
    expect(w.corroborated).toBe(false);
  });
  it("self-report alone is capped", () => {
    expect(face("Posted on LinkedIn 5 times, 20 comments, 3 DMs, shared on Twitter 4 times").score).toBeLessThanOrEqual(66);
  });
  it("recorded activity corroborates", () => {
    const actions = [{ title: "Publish launch post on LinkedIn", actionType: "content" }];
    const w = face("Posted the launch on LinkedIn, 12 likes", { observedMatch: zoneMatchesActions("Visibility", actions) });
    expect(w.verdict).toBe("accepted");
    expect(w.corroborated).toBe(true);
  });
  it("corroboration without any account is still not enough", () => {
    expect(face("done", { observedMatch: true }).verdict).not.toBe("accepted");
  });
  it("copy/paste of earlier evidence is refused", () => {
    const text = "Posted my launch thread on LinkedIn, got 3 comments";
    expect(face(text, { previousTexts: [text] }).verdict).toBe("needs_more");
  });
  it("irrelevant detail does not pass", () => {
    expect(face("Fixed a CSS bug on the pricing page, 2 files changed").verdict).not.toBe("accepted");
  });
  it("gives hints when it says no", () => {
    expect(face("did stuff").hints.length).toBeGreaterThan(0);
  });
});

describe("mirror corrections", () => {
  const corr = (text: string, extra = {}) => weighEvidence({ kind: "mirror_correction", claim: "You avoid user interviews", text, ...extra });
  it("bare denial gets no weight", () => {
    const w = corr("That's wrong");
    expect(w.verdict).toBe("needs_more");
    expect(w.weight).toBe(0);
  });
  it("sweeping absolutes without evidence are penalised", () => {
    expect(corr("I never avoid user interviews, this is totally wrong").verdict).not.toBe("accepted");
  });
  it("specific, relevant evidence is accepted", () => {
    const w = corr("I ran 4 user interviews last week and booked 3 more for Friday", { observed: [{ text: "Run user interviews with 4 founders" }, { text: "Book user interviews for Friday" }] });
    expect(w.verdict).toBe("accepted");
    expect(w.corroborated).toBe(true);
    expect(w.weight).toBe(1);
  });
  it("an account the records don't back counts at reduced weight at best", () => {
    const w = corr("I did two user interviews with customers on a call yesterday");
    expect(["partial", "accepted"]).toContain(w.verdict);
    expect(w.corroborated).toBe(false);
  });
});
