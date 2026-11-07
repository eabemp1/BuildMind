import { describe, it, expect } from "vitest";
import { cleanCompetitorUrl, mergeSources, nameFromHost } from "@/lib/marketWatch/sources";

describe("cleanCompetitorUrl", () => {
  it("cuts an address down to the homepage", () => {
    expect(cleanCompetitorUrl("https://www.Acme.com/pricing?x=1#top")).toEqual({ ok: true, url: "https://www.acme.com/", host: "acme.com" });
  });
  it("accepts a bare domain", () => {
    expect(cleanCompetitorUrl("acme.io")).toMatchObject({ ok: true, url: "https://acme.io/" });
  });
  it("refuses articles, news, social and review sites", () => {
    for (const u of ["https://medium.com/@a/post", "https://www.techcrunch.com/2026/01/01/acme", "https://reddit.com/r/x/comments/1", "https://x.com/acme/status/1", "https://acme.substack.com/p/hi", "https://www.g2.com/products/acme"]) {
      expect(cleanCompetitorUrl(u).ok).toBe(false);
    }
  });
  it("refuses private and malformed addresses", () => {
    expect(cleanCompetitorUrl("http://localhost:3000").ok).toBe(false);
    expect(cleanCompetitorUrl("http://10.0.0.5").ok).toBe(false);
    expect(cleanCompetitorUrl("   ").ok).toBe(false);
    expect(cleanCompetitorUrl("not a site").ok).toBe(false);
  });
});

describe("mergeSources", () => {
  it("puts your own competitors first and keeps one per website", () => {
    const out = mergeSources([{ name: "Mine", url: "mine.com" }], [{ name: "Theirs", url: "https://www.mine.com/about" }, { name: "Other", url: "https://other.com" }]);
    expect(out).toEqual([{ name: "Mine", url: "https://mine.com/" }, { name: "Other", url: "https://other.com/" }]);
  });
  it("names a competitor from its address when no name is given", () => {
    expect(nameFromHost("app.acme.io")).toBe("Acme");
    expect(mergeSources([{ name: "", url: "acme.io" }], [])[0].name).toBe("Acme");
  });
  it("stops at five", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, url: `c${i}.com` }));
    expect(mergeSources(many, [])).toHaveLength(5);
  });
});
