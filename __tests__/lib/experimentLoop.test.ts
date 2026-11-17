import { describe, it, expect } from "vitest";
import { cleanId, cleanKey, effectiveEvents, nextMove, parseEvent, receipts, tally, experimentBlock, type Experiment, type ExperimentEvent } from "@/lib/experiments";
import { rollingPlan } from "@/lib/experimentPlan";
import { knowledge, loopBlock, loopNext, loopStage, parseEvidence, parseOffer, isStale, type Evidence, type Offer } from "@/lib/experimentLoop";

const ev = (id: string, who: string, kind: ExperimentEvent["kind"], at: string, extra: Partial<ExperimentEvent> = {}): ExperimentEvent => ({ id, who, kind, detail: "", created_at: at, ...extra });
const evd = (o: Partial<Evidence> = {}): Evidence => ({ kind: "observation", status: "founder_report", note: "A shop owner said bookings are missed", source: "", source_date: null, last_checked: null, created_at: "2026-11-10T00:00:00Z", ...o });
const off = (o: Partial<Offer> = {}): Offer => ({ version: 1, problem: "Missed bookings", solution: "", availability: "", scope: "", proof: "", price_hypothesis: "", created_at: "2026-11-10T00:00:00Z", ...o });

describe("stage mapping", () => {
  it("maps BuildMind stages", () => {
    expect(loopStage(null, "Idea", false)).toBe("idea");
    expect(loopStage(null, "Validation", false)).toBe("validation");
    expect(loopStage(null, "MVP", false)).toBe("build");
    expect(loopStage(null, "Launch", false)).toBe("first_revenue");
    expect(loopStage(null, "Growth", false)).toBe("after_revenue");
  });
  it("a confirmed payment moves Launch to after revenue, nothing else does", () => {
    expect(loopStage(null, "Launch", true)).toBe("after_revenue");
    expect(loopStage(null, "Idea", true)).toBe("idea");
  });
  it("the founder's own choice wins, so an established product does not restart", () => {
    expect(loopStage("first_revenue", "Idea", false)).toBe("first_revenue");
  });
  it("unknown stage is read as the most cautious", () => expect(loopStage(null, "???", false)).toBe("idea"));
});

describe("corrections keep history and stop counting the old entry", () => {
  const events = [ev("1", "Ama", "sent", "2026-11-01"), ev("2", "Ama", "paid", "2026-11-02"), ev("3", "Ama", "replied", "2026-11-03", { corrects_id: "2" })];
  it("a corrected entry no longer counts, the correction does", () => {
    expect(effectiveEvents(events).map((e) => e.id)).toEqual(["1", "3"]);
    expect(tally(events).paid).toBe(0);
    expect(receipts(events)[0].state).toBe("replied");
  });
  it("the original is still in the list the page shows", () => expect(events.find((e) => e.id === "2")?.kind).toBe("paid"));
  it("a withdrawal removes the entry and itself from the count", () => {
    const e = [ev("1", "Ama", "paid", "1"), ev("2", "Ama", "retracted", "2", { corrects_id: "1" })];
    expect(effectiveEvents(e)).toEqual([]);
    expect(tally(e).people).toBe(0);
  });
  it("a correction can itself be corrected", () => {
    const e = [ev("1", "A", "sent", "1"), ev("2", "A", "replied", "2", { corrects_id: "1" }), ev("3", "A", "no_reply", "3", { corrects_id: "2" })];
    expect(effectiveEvents(e).map((x) => x.id)).toEqual(["3"]);
  });
});

describe("test data never counts", () => {
  it("synthetic entries are ignored by tally, receipts and the plan", () => {
    const events = [ev("1", "Fake", "paid", "2026-11-02", { synthetic: true }), ev("2", "Fake", "replied", "2026-11-02", { synthetic: true })];
    expect(tally(events)).toMatchObject({ people: 0, paid: 0, replied: 0 });
    expect(receipts(events)).toEqual([]);
    const exp = { id: "x", goal: "g", hypothesis: "", audience: "", plan: "", status: "running", decision: null, decision_note: "", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", events } as Experiment;
    expect(rollingPlan(exp, Date.parse("2026-11-05")).milestones.every((m) => !m.done)).toBe(true);
  });
  it("synthetic evidence is not known", () => {
    const k = knowledge("validation", [evd({ synthetic: true })], null, []);
    expect(k.known).toEqual([]);
    expect(k.unknown.join(" ")).toMatch(/No evidence recorded/);
  });
});

describe("outcomes are separate: interest is not payment", () => {
  it("pilot agreed is not paid", () => {
    const t = tally([ev("1", "Ama", "pilot_agreed", "1")]);
    expect(t.paid).toBe(0);
    expect(nextMove(t).headline).toMatch(/not paid|ask for payment/i);
  });
  it("would pay is not paid", () => expect(tally([ev("1", "A", "would_pay", "1")]).paid).toBe(0));
  it("delivered does not erase the payment before it, and delivery without payment is not payment", () => {
    expect(tally([ev("1", "A", "paid", "1"), ev("2", "A", "delivered", "2")])).toMatchObject({ paid: 1, delivered: 1 });
    expect(tally([ev("1", "B", "delivered", "1")])).toMatchObject({ paid: 0, delivered: 1 });
  });
  it("declined is a result, not silence", () => expect(tally([ev("1", "A", "declined", "1")]).declined).toBe(1));
  it("plan milestones: pilot agreement does not tick 'someone says they would pay' or 'someone pays'", () => {
    const exp = { id: "x", goal: "g", hypothesis: "", audience: "", plan: "", status: "running", decision: null, decision_note: "", created_at: "2026-11-01T00:00:00Z", updated_at: "x", events: [ev("1", "A", "pilot_agreed", "2026-11-02")] } as Experiment;
    const m = rollingPlan(exp, Date.parse("2026-11-05")).milestones;
    expect(m.find((x) => x.id === "willing")?.done).toBe(false);
    expect(m.find((x) => x.id === "paid")?.done).toBe(false);
  });
});

describe("parsing", () => {
  it("withdrawing needs no person", () => expect(parseEvent({ kind: "retracted" }).ok).toBe(true));
  it("new outcome kinds parse", () => { for (const k of ["conversation", "declined", "pilot_agreed", "delivered"]) expect(parseEvent({ kind: k, who: "A" }).ok).toBe(true); });
  it("retry keys and ids are validated", () => {
    expect(cleanKey("abc")).toBeNull();
    expect(cleanKey("0f8fad5b-d9cb-469f-a165-70867728950e")).not.toBeNull();
    expect(cleanKey("bad key with spaces")).toBeNull();
    expect(cleanId("not-a-uuid")).toBeNull();
  });
  it("an assumption is always an assumption", () => {
    const r = parseEvidence({ kind: "assumption", status: "observed", note: "Shops lose bookings" });
    expect(r.ok && r.value.status).toBe("assumption");
  });
  it("'observed' needs a source someone can check", () => {
    expect(parseEvidence({ kind: "observation", status: "observed", note: "Saw it on their page" }).ok).toBe(false);
    expect(parseEvidence({ kind: "observation", status: "observed", note: "Saw it on their page", source: "https://example.com/p" }).ok).toBe(true);
  });
  it("otherwise it is the founder's report", () => {
    const r = parseEvidence({ kind: "conversation", note: "Ama said she misses calls" });
    expect(r.ok && r.value.status).toBe("founder_report");
  });
  it("an offer needs the problem; bad evidence ids are dropped", () => {
    expect(parseOffer({ solution: "x" }).ok).toBe(false);
    const r = parseOffer({ problem: "p", evidence_ids: ["nope", "0f8fad5b-d9cb-469f-a165-70867728950e"] });
    expect(r.ok && r.value.evidence_ids).toHaveLength(1);
  });
});

describe("known, assumed, unknown", () => {
  it("keeps assumptions apart from facts and says price is a guess", () => {
    const k = knowledge("first_revenue", [evd(), evd({ kind: "assumption", status: "assumption", note: "Owners will pay monthly" })], off({ price_hypothesis: "£20/month" }), []);
    expect(k.known.join(" ")).toMatch(/shop owner/);
    expect(k.assumed.join(" ")).toMatch(/Owners will pay monthly/);
    expect(k.assumed.join(" ")).toMatch(/£20\/month is a guess/);
    expect(k.unknown.join(" ")).toMatch(/no confirmed payment/);
  });
  it("what the offer leaves out stays unknown, not filled in", () => {
    const k = knowledge("build", [evd()], off(), []);
    expect(k.unknown.join(" ")).toMatch(/works and can be delivered today/);
    expect(k.unknown.join(" ")).toMatch(/your proof/);
  });
  it("old evidence is flagged, assumptions are not", () => {
    const old = evd({ created_at: "2026-01-01T00:00:00Z" });
    expect(isStale(old, Date.parse("2026-11-16"))).toBe(true);
    expect(isStale({ ...old, kind: "assumption" }, Date.parse("2026-11-16"))).toBe(false);
    expect(isStale({ ...old, last_checked: "2026-11-10T00:00:00Z" }, Date.parse("2026-11-16"))).toBe(false);
  });
  it("a payment you confirmed is known, one you did not is not", () => {
    expect(knowledge("first_revenue", [evd()], off(), [ev("1", "A", "paid", "1")]).known.join(" ")).toMatch(/paid \(you confirmed/);
    expect(knowledge("first_revenue", [evd()], off(), [ev("1", "A", "would_pay", "1")]).known.join(" ")).not.toMatch(/paid/);
  });
});

describe("next recommendation is explainable", () => {
  it("with nothing recorded, asks for evidence and invents none", () => {
    const n = loopNext("validation", [], null, []);
    expect(n.headline).toMatch(/actually saw or heard|assumption/);
    expect(n.because.join(" ")).toMatch(/Stage: Validation/);
  });
  it("after validation, needs an offer before anything else", () => expect(loopNext("validation", [evd()], null, []).headline).toMatch(/Write the offer/));
  it("a build offer must say what works today", () => expect(loopNext("build", [evd()], off(), []).headline).toMatch(/works and can be delivered today/));
  it("first revenue needs a price to test", () => expect(loopNext("first_revenue", [evd()], off({ availability: "demo works" }), []).headline).toMatch(/price to test/));
  it("with records in place it follows the recorded outcomes and lists what it used", () => {
    const n = loopNext("first_revenue", [evd()], off({ availability: "works", price_hypothesis: "£20" }), [ev("1", "A", "would_pay", "1")]);
    expect(n.headline).toMatch(/pilot/i);
    expect(n.because.length).toBeGreaterThanOrEqual(4);
  });
  it("at the idea stage it asks for a conversation, not a sale", () => {
    const n = loopNext("idea", [evd()], null, [ev("1", "A", "sent", "1")]);
    expect(n.why).toMatch(/conversation, not a sale/);
  });
});

describe("what Coach sees", () => {
  it("never states an assumption as fact, and forbids inventing", () => {
    const b = loopBlock("validation", [evd({ kind: "assumption", status: "assumption", note: "Owners want SMS" })], off(), []);
    expect(b).toMatch(/Assumed \(not verified, never present as fact\): Owners want SMS/);
    expect(b).toMatch(/Do not invent meetings/);
  });
  it("experiment block counts only effective outcomes", () => {
    const e = { id: "x", goal: "g", hypothesis: "", audience: "", plan: "", status: "running", decision: null, decision_note: "", created_at: "1", updated_at: "1", events: [ev("1", "A", "paid", "1", { synthetic: true })] } as Experiment;
    expect(experimentBlock(e)).toMatch(/Paid: 0/);
  });
});

describe("milestone link", () => {
  it("names the milestone in the reasoning and in what Coach sees, and never claims it completes one", () => {
    expect(loopNext("validation", [evd()], null, [], "Talk to 5 shop owners").because.join(" ")).toMatch(/Milestone: Talk to 5 shop owners/);
    const e = { id: "x", goal: "g", hypothesis: "", audience: "", plan: "", status: "running", decision: null, decision_note: "", created_at: "1", updated_at: "1", events: [], milestone: { id: "m", title: "Talk to 5 shop owners", stage: "Validation", done: false } } as Experiment;
    const b = experimentBlock(e);
    expect(b).toMatch(/Part of milestone: "Talk to 5 shop owners" \(not completed\)/);
    expect(b).toMatch(/Only the founder completes a milestone/);
  });
  it("no link, no line", () => {
    const e = { id: "x", goal: "g", hypothesis: "", audience: "", plan: "", status: "running", decision: null, decision_note: "", created_at: "1", updated_at: "1", events: [] } as Experiment;
    expect(experimentBlock(e)).not.toMatch(/milestone/i);
  });
});
