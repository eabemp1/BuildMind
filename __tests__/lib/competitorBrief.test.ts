import { describe, it, expect } from "vitest";
import { normalizeCompetitors, competitorSummaryLine } from "@/lib/break/competitorBrief";

const scraped = [
  { title: "Acme Tracker", url: "https://www.acme.com/", snippet: "x", pageFacts: { read: true, prices: ["$19/mo"], pricingPageSeen: true } },
  { title: "Beta Tool", url: "https://beta.io", snippet: "y" },
];

describe("competitorBrief", () => {
  it("uses the page price and ignores model pricing", () => {
    const rows = normalizeCompetitors([{ name: "Acme", url: "https://acme.com", weakness: "slow", pricing: "$1/mo" } as never], scraped);
    expect(rows[0].siteRead).toBe(true);
    expect(rows[0].pricing).toBe("Seen on their site: $19/mo");
  });
  it("says not verified when the site was not read", () => {
    const rows = normalizeCompetitors([{ name: "Beta Tool", weakness: "w" }], scraped);
    expect(rows[0].siteRead).toBe(false);
    expect(rows[0].pricing).toMatch(/Not verified/);
  });
  it("handles junk and caps at 5", () => {
    expect(normalizeCompetitors(undefined, [])).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `C${i}` }));
    expect(normalizeCompetitors(many, [])).toHaveLength(5);
  });
  it("summary states how many sites were read", () => {
    const rows = normalizeCompetitors([{ name: "Acme" }, { name: "Beta Tool" }], scraped);
    const line = competitorSummaryLine(rows, { name: "Acme", why: "Owns the niche." }, "high");
    expect(line).toContain("Biggest threat: Acme");
    expect(line).toContain("1 of 2");
  });
});
