import { describe, it, expect } from "vitest";
import { normaliseDomain, factsFromDigest } from "@/lib/break/domain";
import { digestHtml, isSafePublicUrl } from "@/lib/pageReader";

describe("scan my site", () => {
  it("normalises domains and rejects junk", () => {
    expect(normaliseDomain("https://www.Acme.com/pricing?x=1")).toBe("https://acme.com");
    expect(normaliseDomain("acme.io")).toBe("https://acme.io");
    for (const bad of ["", "localhost", "a b.com", "http://10.0.0.1", "nodot", "x"]) {
      const n = normaliseDomain(bad);
      expect(n === null || !isSafePublicUrl(n)).toBe(true);
    }
  });
  it("page-only facts never invent an audience or problem", () => {
    const d = digestHtml("https://acme.com", `<title>Acme</title><meta name="description" content="Invoices for freelancers, sent in one click."><h1>Get paid faster</h1>`);
    const f = factsFromDigest(d);
    expect(f.idea).toContain("Invoices for freelancers");
    expect(f.targetUsers).toBe("");
    expect(f.problem).toBe("");
  });
});
