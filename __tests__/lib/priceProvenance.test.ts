import { describe, it, expect } from "vitest";
import { annotatePrices, annotateDeep, listedPrices } from "@/lib/break/priceProvenance";

const comp = [{ name: "RivalCo", url: "https://rival.co/pricing", price: "£49/month" }];

describe("price provenance", () => {
  it("founder typed it: labelled Founder hypothesis", () => {
    const out = annotatePrices("Ask 10 people to pre-pay £95/month.", "A tool for plumbers at £95/month", []);
    expect(out).toContain("£95/month");
    expect(out).toContain("Founder hypothesis");
  });
  it("competitor lists it: cites the page and matches amount, currency and period", () => {
    const out = annotatePrices("Undercut at £49/month.", "idea", comp);
    expect(out).toContain("RivalCo's listed price on https://rival.co/pricing");
    expect(annotatePrices("Charge £49/year.", "idea", comp)).toContain("a price you choose");
    expect(annotatePrices("Charge $49/month.", "idea", comp)).toContain("a price you choose");
    expect(annotatePrices("Charge £49.", "idea", comp)).toContain("a price you choose");
  });
  it("only the AI suggested it: a price you choose", () => {
    const out = annotatePrices("Test with £95/month.", "A tool for plumbers", []);
    expect(out).toBe("Test with a price you choose.");
  });
  it("$400 never validates $40 (either direction, any source)", () => {
    expect(annotatePrices("Try $40/month.", "I charge $400/month", [])).toContain("a price you choose");
    expect(annotatePrices("Try $40/month.", "idea", [{ name: "X", price: "$400/month" }])).toContain("a price you choose");
    expect(annotatePrices("Try $400/month.", "I charge $40/month", [])).toContain("a price you choose");
  });
  it("Proof layer strings and reopened saved reports are covered", () => {
    const data = { agent_outputs: { competitor: { brief: [{ name: "RivalCo", url: "https://rival.co", pricing: "Seen on their site: £49/month" }] } } };
    const layer = { falsifiers: [{ test: "Ask for a deposit at £95/month." }], n: 3 };
    const out = annotateDeep(layer, "idea", listedPrices(data));
    expect(out.falsifiers[0].test).toContain("a price you choose");
    expect(out.n).toBe(3);
    expect(listedPrices(data)[0]).toMatchObject({ name: "RivalCo", url: "https://rival.co", price: "£49/month" });
    expect(listedPrices({ agent_outputs: { competitor: { brief: [{ name: "A", pricing: "Not verified (their site was not read)" }] } } })).toEqual([]);
  });
});
