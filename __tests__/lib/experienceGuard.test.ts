import { describe, expect, it } from "vitest";
import { inventedExperience, inventedTerms } from "@/lib/prep/experienceGuard";

describe("inventedExperience", () => {
  it("flags the stories seen in testing", () => {
    expect(inventedExperience("Last week a customer asked me whether his bike was ready.")).not.toEqual([]);
    expect(inventedExperience("I own a bike shop in Bristol and kept missing pickups.")).not.toEqual([]);
    expect(inventedExperience("Three shop owners told me they hate chasing customers.")).not.toEqual([]);
    expect(inventedExperience("I've spoken to several shop owners about this.")).not.toEqual([]);
    expect(inventedExperience("Our customers love the reminders.")).not.toEqual([]);
    expect(inventedExperience("I made a mistake early on that cost me two customers.")).not.toEqual([]);
  });
  it("allows what the founder said themselves", () => {
    expect(inventedExperience("I own a bike shop in Bristol.", "I own a bike shop in Bristol and want to fix pickups")).toEqual([]);
  });
  it("leaves honest research drafts alone", () => {
    expect(inventedExperience("I'm researching how independent bike shops handle missed pickups. How do you handle them today?")).toEqual([]);
    expect(inventedExperience("Could I ask two questions about how you remind customers?")).toEqual([]);
  });
});

describe("inventedTerms", () => {
  it("flags commitments nobody decided on", () => {
    for (const t of ["Cancel anytime.", "Unlimited reminder texts included.", "No contracts.", "We never sell your data.", "24/7 support.", "Pay by card or cash.", "Cut missed pickups in half."]) {
      expect(inventedTerms(t), t).not.toEqual([]);
    }
  });
  it("allows them when the founder stated them", () => {
    expect(inventedTerms("Cancel anytime.", "Plan: $9/month, cancel anytime")).toEqual([]);
  });
  it("leaves placeholders and neutral copy alone", () => {
    expect(inventedTerms("Price: [add: monthly price]. Refund policy: [add: your policy].")).toEqual([]);
  });
});

import { filterVariants } from "@/lib/distribution/engine";
import { draftProblems } from "@/lib/work/shape";

describe("wired into drafting", () => {
  const variants = [
    { id: "v1", label: "Honest", text: "I'm researching how bike shops handle missed pickups. How do you handle them today?" },
    { id: "v2", label: "Story", text: "Last week a customer asked me where his bike was, so I built a reminder tool." },
  ];
  it("drops Today drafts that invent a story, keeps the honest one", () => {
    const kept = filterVariants("post", "other", variants as never, undefined, "QueuePilot: reminders for bike shops. Stage: idea.");
    expect(kept.map((v) => v.label)).toEqual(["Honest"]);
  });
  it("lets a Work draft through only when the brief gave the story", () => {
    const spec = { shape: "variants" } as never;
    const result = { title: "t", summary: "", variants: [variants[1]], sections: [], needs: [] } as never;
    expect(draftProblems(result, spec, "bike shops", "idea").join(" ")).toMatch(/experience the founder never gave/);
    expect(draftProblems(result, spec, "Last week a customer asked me where his bike was, so I built a reminder tool.", "idea").join(" ")).not.toMatch(/experience the founder never gave/);
  });
  it("flags invented pricing terms in a section", () => {
    const spec = { shape: "sections" } as never;
    const result = { title: "FAQ", summary: "", variants: [], sections: [{ heading: "Cancelling", bullets: ["Cancel anytime. Unlimited texts."] }], needs: [] } as never;
    expect(draftProblems(result, spec, "price undecided", "idea").join(" ")).toMatch(/prices, policies/);
  });
});

import { digestHtml } from "@/lib/pageReader";
describe("price reading", () => {
  it("reads real prices and ignores dashboard revenue", () => {
    const html = "<html><body><h1>Plans</h1><p>Pro is $39/month or $390 per year.</p><div class='demo'>Revenue this quarter $12,400 and $8,250</div></body></html>";
    const d = digestHtml("https://x.test", html);
    expect(d.prices).toEqual(["$39/month", "$390 per year"]);
  });
  it("does not cut an amount short", () => {
    expect(digestHtml("https://x.test", "<p>Teams pay $1,200 per year</p>").prices).toEqual(["$1,200 per year"]);
  });
});

import { cleanQuery } from "@/lib/agentWorkforce";
describe("cleanQuery", () => {
  it("keeps the real problem and drops QA wording", () => {
    expect(cleanQuery("Bike shops miss pickups. This is a fictional QA test of severe founder avoidance.")).toBe("Bike shops miss pickups.");
    expect(cleanQuery("Independent bike shops in Bristol")).toBe("Independent bike shops in Bristol");
  });
});
