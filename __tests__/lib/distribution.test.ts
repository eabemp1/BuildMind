import { describe, it, expect } from "vitest";
import { analyseText, observe } from "@/lib/distribution/textSignals";
import { wilson, compareExperiments, confidenceOf, missingEvidence, type Experiment } from "@/lib/distribution/experiments";

const exp = (o: Partial<Experiment>): Experiment => ({ id: "a", hypothesis: "h", platform: "linkedin", status: "done", impressions: null, replies: null, meaningful_exchanges: null, profile_visits: null, qualified_founders: null, signups: null, activations: null, paid: null, ...o });

describe("text signals", () => {
  it("flags a coined-term opening and heavy promotion", () => {
    const s = analyseText("Founder Execution Intelligence is the future. BuildMind does it. BuildMind is great. Try BuildMind.", "linkedin");
    expect(s.opensWithCoinedTerm).toContain("Founder Execution Intelligence");
    expect(s.productMentions).toBe(3);
    const keys = observe(s, "linkedin").filter((o) => o.status === "watch").map((o) => o.key);
    expect(keys).toContain("coined-term");
    expect(keys).toContain("product-density");
    expect(keys).toContain("no-question");
  });
  it("recognises a concrete, question-ending post", () => {
    const s = analyseText("Last Tuesday I shipped 3 features and no customer noticed.\nHow do you tell busy from progress?", "linkedin");
    expect(s.hasNumbers).toBe(true);
    expect(s.endsWithQuestion).toBe(true);
    expect(s.opensWithCoinedTerm).toBeNull();
    expect(observe(s, "linkedin").every((o) => o.status === "ok")).toBe(true);
  });
  it("platform limit", () => {
    expect(analyseText("x".repeat(300), "x").overLimitBy).toBe(20);
  });
  it("empty text gives no observations", () => expect(observe(analyseText("", "x"), "x")).toEqual([]));
});

describe("experiment comparison", () => {
  it("wilson is sane", () => {
    const w = wilson(5, 100);
    expect(w.rate).toBe(0.05);
    expect(w.lo).toBeLessThan(0.05);
    expect(w.hi).toBeGreaterThan(0.05);
    expect(wilson(0, 0).rate).toBe(0);
  });
  it("never crowns a winner on tiny reach", () => {
    const c = compareExperiments([exp({ id: "a", impressions: 40, qualified_founders: 2 }), exp({ id: "b", impressions: 3000, qualified_founders: 0 })]);
    expect(c.verdict).toBe("insufficient");
  });
  it("high impressions with no people does not beat low reach with people", () => {
    const c = compareExperiments([
      exp({ id: "wide", impressions: 20000, replies: 300, qualified_founders: 0 }),
      exp({ id: "narrow", impressions: 600, qualified_founders: 4, meaningful_exchanges: 6 }),
    ]);
    expect(c.verdict).toBe("leader");
    expect(c.leaderId).toBe("narrow");
  });
  it("overlapping intervals are not a result", () => {
    const c = compareExperiments([exp({ id: "a", impressions: 500, qualified_founders: 3 }), exp({ id: "b", impressions: 500, qualified_founders: 4 })]);
    expect(c.verdict).toBe("no_clear_difference");
  });
  it("needs two experiments", () => expect(compareExperiments([exp({ impressions: 900, qualified_founders: 5 })]).verdict).toBe("insufficient"));
  it("confidence and missing evidence", () => {
    expect(confidenceOf(exp({ impressions: 10 })).level).toBe("insufficient");
    expect(confidenceOf(exp({ impressions: 900, qualified_founders: 1 })).level).toBe("low");
    expect(confidenceOf(exp({ impressions: 900, qualified_founders: 4 })).level).toBe("moderate");
    expect(missingEvidence(exp({}))).toContain("impressions (reach)");
  });
});

import { normaliseDiagnosis, fallbackDiagnosis } from "@/lib/distribution/diagnose";
describe("diagnosis normalisation", () => {
  const input = { body: "Founder Execution Intelligence matters. Most founders confuse busy with progress.", platform: "linkedin" as const };
  it("drops quotes that are not in the draft and keeps the point", () => {
    const d = normaliseDiagnosis({ working: [{ point: "Strong idea", quote: "confuse busy with progress" }], weakening: [{ point: "Invented", quote: "this text is not there" }], revisions: [{ approach: "personal", text: "Last week I…", why: "w", hypothesis: "h", metric: "replies", changeIf: "c" }] }, input);
    expect(d.working[0].quote).toBe("confuse busy with progress");
    expect(d.weakening[0].quote).toBeNull();
    expect(d.revisions).toHaveLength(1);
    expect(d.observations.length).toBeGreaterThan(0);
  });
  it("tolerates garbage", () => {
    const d = normaliseDiagnosis("nope", input);
    expect(d.revisions).toEqual([]);
    expect(d.ai).toBe(true);
  });
  it("fallback is measured-only", () => {
    const f = fallbackDiagnosis(input);
    expect(f.ai).toBe(false);
    expect(f.observations.length).toBeGreaterThan(0);
  });
});

import { buildOverview, type Conversation } from "@/lib/distribution/overview";
describe("overview", () => {
  const now = new Date("2026-10-14T12:00:00Z").getTime();
  const conv = (o: Partial<Conversation>): Conversation => ({ id: "c", platform: "reddit", status: "queued", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...o });
  it("empty data gives null metrics, never zeros or invented numbers", () => {
    const o = buildOverview({ conversations: [], experiments: [], drafts: [] }, now);
    expect(o.metrics.every((m) => m.value === null)).toBe(true);
    expect(o.actions[0].id).toBe("rule-contact");
    expect(o.insight).toBeNull();
  });
  it("the contact rule disappears once you have talked to someone today", () => {
    const o = buildOverview({ conversations: [conv({ id: "a", status: "replied", last_contacted_at: "2026-10-14T09:00:00Z" })], experiments: [], drafts: [] }, now);
    expect(o.actions.some((a) => a.id === "rule-contact")).toBe(false);
    expect(o.interactionsToday).toBe(1);
    expect(o.metrics[0].value).toBe(1);
  });
  it("stale interested conversations become follow-ups ranked above queued ones", () => {
    const o = buildOverview({ conversations: [conv({ id: "q", excerpt: "Q" }), conv({ id: "i", status: "interested", excerpt: "I", last_contacted_at: "2026-10-05T00:00:00Z" })], experiments: [], drafts: [] }, now);
    const ids = o.actions.map((a) => a.id);
    expect(ids.indexOf("fu-i")).toBeLessThan(ids.indexOf("q-q"));
    expect(o.metrics[1].value).toBe(1);
  });
  it("insight only appears from logged evidence", () => {
    const e = (id: string) => ({ id, hypothesis: "h", platform: "x", status: "done", impressions: 2000, replies: 5, meaningful_exchanges: 1, profile_visits: null, qualified_founders: 0, signups: null, activations: null, paid: null });
    expect(buildOverview({ conversations: [], experiments: [e("a"), e("b")], drafts: [] }, now).insight?.text).toContain("more specific");
  });
});
