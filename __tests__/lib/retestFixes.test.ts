import { describe, it, expect } from "vitest";
import { mirrorGate } from "@/lib/mirrorGate";
import { markTestRun } from "@/lib/testMode";
import { fitsMarket, keepFitting } from "@/lib/competitorFit";
import { priceKey } from "@/lib/marketWatch/diff";
import { dropContradictedWeakness } from "@/lib/break/competitorBrief";
import { fallbackPrep } from "@/lib/prep/fallback";
import { hasUnsourcedResearchClaim, stripUnsourcedResearch } from "@/lib/break/unsourced";
import { evidenceRung, TIER_LABEL } from "@/lib/evidence";

describe("Founder Mirror gate", () => {
  it("gates below 7 real reflections", () => {
    expect(mirrorGate(["a", "b"], false)).toMatchObject({ gated: true, realCount: 2, reason: "too_few" });
  });
  it("opens at 7 real reflections", () => {
    expect(mirrorGate(Array(7).fill("real note"), false).gated).toBe(false);
  });
  it("never counts test-run reflections, and is always gated in test mode", () => {
    const notes = [...Array(6).fill("real"), markTestRun("fake")];
    expect(mirrorGate(notes, false)).toMatchObject({ gated: true, realCount: 6 });
    expect(mirrorGate(Array(9).fill("real"), true)).toMatchObject({ gated: true, reason: "test_run" });
  });
});

describe("competitor market fit", () => {
  const bike = { name: "QueuePilot", description: "Appointment reminders for independent bicycle repair shops", targetUsers: "bike shop owners" };
  it("drops a same-name product from another market", () => {
    expect(fitsMarket(bike, { title: "QueuePilot contact centre software", snippet: "Call routing and agent queues for enterprise support teams" })).toBe(false);
  });
  it("drops software-testing tools that only share a generic word", () => {
    expect(fitsMarket(bike, { title: "TestPilot automated testing", snippet: "Run automated tests for web apps and track bugs" })).toBe(false);
  });
  it("keeps a bike-shop product", () => {
    expect(fitsMarket(bike, { title: "ShopFlow for bike shops", snippet: "Booking and repair tracking for bicycle shops" })).toBe(true);
  });
  it("judges nothing when the project says too little", () => {
    expect(fitsMarket({ name: "X" }, { title: "Anything" })).toBe(true);
    expect(keepFitting(bike, [{ title: "bicycle repair booking" }, { title: "call centre queue" }])).toHaveLength(1);
  });
});

describe("price text", () => {
  it("treats £35/mo and £35/month as the same price", () => {
    expect(priceKey("£35/mo")).toBe(priceKey("£35/month"));
    expect(priceKey("£35 per month")).toBe(priceKey("£35/mo"));
  });
  it("still sees a real change", () => {
    expect(priceKey("£35/mo")).not.toBe(priceKey("£39/mo"));
    expect(priceKey("£35/mo")).not.toBe(priceKey("£35/year"));
  });
});

describe("competitor weakness contradiction", () => {
  it("drops 'does not highlight reminders' when reminders are in what they do", () => {
    const out = dropContradictedWeakness("It does not highlight reminders. Pricing is opaque.", "Sends automated reminders to customers");
    expect(out).toBe("Pricing is opaque.");
  });
  it("keeps a weakness nothing contradicts", () => {
    expect(dropContradictedWeakness("No mobile app.", "Web booking and invoicing")).toBe("No mobile app.");
  });
});

describe("Action Plan fallback", () => {
  it("does not point to a first move that is not shown", () => {
    const f = fallbackPrep("action_plan", "Call one bike shop", undefined);
    expect(JSON.stringify(f)).not.toMatch(/first move below/);
    expect(JSON.stringify(f)).not.toMatch(/first move above/);
  });
  it("points to it when it is shown", () => {
    expect(JSON.stringify(fallbackPrep("action_plan", "Call one bike shop", "Find a number"))).toMatch(/first move above/);
  });
});

describe("unsourced research claims", () => {
  it("drops survey statistics and counted interviews", () => {
    expect(hasUnsourcedResearchClaim("73% of surveyed shop owners want reminders")).toBe(true);
    expect(hasUnsourcedResearchClaim("After 12 customer interviews the pain is clear")).toBe(true);
    expect(hasUnsourcedResearchClaim("No interviews have been recorded yet")).toBe(false);
  });
  it("keeps the rest", () => {
    expect(stripUnsourcedResearch(["Demand is unproven", "60% of respondents said yes"])).toEqual(["Demand is unproven"]);
  });
});

describe("evidence: price list is not a payment", () => {
  it("advertised price and paid plans are not a paid pilot", () => {
    expect(evidenceRung("Their paid plans start at $29/month")).not.toBe("paid_pilot");
    expect(evidenceRung("Pricing starts at £35/mo for the standard tier")).toBe("adjacent_clue");
  });
  it("a real payment still is", () => {
    expect(evidenceRung("Three shops paid £20 for the pilot")).toBe("paid_pilot");
  });
  it("does not call anything decision-grade before review", () => {
    expect(TIER_LABEL.decision_grade).not.toMatch(/decision/i);
  });
});
