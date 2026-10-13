import { describe, it, expect } from "vitest";
import { digestHtml, isSafePublicUrl } from "@/lib/pageReader";
import { mergeResults, normaliseUrl } from "@/lib/searchRank";

describe("pageReader", () => {
  it("blocks private and non-http targets", () => {
    for (const u of ["http://localhost/x", "http://127.0.0.1/", "http://169.254.169.254/latest", "http://10.0.0.5/", "file:///etc/passwd", "https://user:pw@example.com/", "http://[::1]/", "https://example.com:8080/"]) expect(isSafePublicUrl(u)).toBe(false);
    expect(isSafePublicUrl("https://example.com/pricing")).toBe(true);
  });
  it("extracts title, description, headings, prices and drops scripts", () => {
    const d = digestHtml("https://x.com", `<html><head><title>Acme &amp; Co</title><meta name="description" content="Invoicing for freelancers"></head><body><script>var a=1</script><h1>Get paid faster</h1><p>Plans from $19/mo</p><a href="/pricing">Pricing</a></body></html>`);
    expect(d.title).toBe("Acme & Co");
    expect(d.description).toBe("Invoicing for freelancers");
    expect(d.headings).toContain("Get paid faster");
    expect(d.prices[0]).toContain("$19");
    expect(d.hasPricingPage).toBe(true);
    expect(d.text).not.toContain("var a");
  });
});

describe("mergeResults", () => {
  const r = (url: string, title: string, snippet = "") => ({ url, title, snippet, source_type: "web" as const });
  it("dedupes tracking variants and boosts consensus", () => {
    expect(normaliseUrl("https://www.a.com/x/?utm_source=z")).toBe(normaliseUrl("http://a.com/x"));
    const out = mergeResults([[r("https://a.com/x", "invoice tool"), r("https://b.com", "invoice app")], [r("https://b.com?utm_x=1", "invoice app")]], "invoice app", 5);
    expect(out[0].url).toContain("b.com");
    expect(out.length).toBe(2);
  });
  it("caps results per host", () => {
    const list = [1, 2, 3, 4].map((i) => r(`https://same.com/${i}`, "invoice"));
    expect(mergeResults([list], "invoice", 10, 2).length).toBe(2);
  });
});
