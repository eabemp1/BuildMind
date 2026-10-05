import { describe, it, expect } from "vitest";
import { needsWebResearch, extractUrls } from "@/lib/webResearchGate";
import { htmlToReadableText, assertPublicUrl, sanitizePlan, formatResearchBlock, fallbackPlan } from "@/lib/webResearch";

describe("needsWebResearch", () => {
  it("fires for outside-world questions and pasted links", () => {
    expect(needsWebResearch("What are the main competitors to Notion for founders?")).toBe(true);
    expect(needsWebResearch("look up pricing for Linear")).toBe(true);
    expect(needsWebResearch("read https://example.com/pricing and tell me what you think")).toBe(true);
  });
  it("stays off for personal and in-app messages", () => {
    expect(needsWebResearch("show my open tasks")).toBe(false);
    expect(needsWebResearch("I'm stuck and tired today")).toBe(false);
    expect(needsWebResearch("why am I avoiding outreach?")).toBe(false);
    expect(needsWebResearch("ok")).toBe(false);
  });
  it("extracts urls without trailing punctuation", () => {
    expect(extractUrls("see https://a.com/x, and http://b.org.")).toEqual(["https://a.com/x", "http://b.org"]);
  });
});

describe("assertPublicUrl", () => {
  it.each(["http://localhost:3000", "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5/", "http://192.168.1.1", "http://[::1]/", "ftp://example.com", "http://user:pw@example.com", "file:///etc/passwd"])("blocks %s", async (u) => {
    await expect(assertPublicUrl(u)).rejects.toThrow();
  });
  it("allows a public IP literal", async () => {
    await expect(assertPublicUrl("https://1.1.1.1/")).resolves.toBeInstanceOf(URL);
  });
});

describe("htmlToReadableText", () => {
  it("drops scripts, nav and footer and keeps the article", () => {
    const html = `<html><head><title>Acme &amp; Co</title></head><body><nav>Home About Pricing Login Signup now</nav><script>var x=1</script>
      <article><h1>Acme pricing explained</h1><p>The Starter plan costs $12 per month and includes three projects with unlimited tasks for solo founders.</p><p>The Team plan costs $39 per month and adds shared workspaces, reporting and priority support for small teams.</p></article><footer>Copyright Acme Corporation all rights reserved worldwide</footer></body></html>`;
    const r = htmlToReadableText(html);
    expect(r.title).toBe("Acme & Co");
    expect(r.text).toContain("Starter plan costs $12");
    expect(r.text).not.toContain("var x");
    expect(r.text).not.toContain("Copyright");
  });
});

describe("plan + prompt", () => {
  it("only fetches urls the founder actually pasted", () => {
    const p = sanitizePlan({ needs_web: true, queries: ["a b c d"], urls: ["https://evil.test/x"] }, "what do you think of my site");
    expect(p.urls).toEqual([]);
    const q = sanitizePlan({ needs_web: true, queries: [], urls: [] }, "check https://mysite.com please");
    expect(q.urls).toEqual(["https://mysite.com"]);
  });
  it("caps queries at three", () => {
    expect(sanitizePlan({ queries: ["aaaa", "bbbb", "cccc", "dddd"] }, "x").queries).toHaveLength(3);
  });
  it("falls back to the message as the query", () => {
    expect(fallbackPlan("best tools for founder accountability").queries[0]).toMatch(/accountability/);
  });
  it("tells the model plainly when nothing was found", () => {
    expect(formatResearchBlock({ sources: [], queries: ["q"], attempted: true })).toMatch(/returned nothing usable/);
    expect(formatResearchBlock({ sources: [], queries: [], attempted: false })).toBe("");
  });
  it("numbers sources and fences them as untrusted", () => {
    const b = formatResearchBlock({ attempted: true, queries: ["q"], sources: [{ n: 1, title: "T", url: "https://a.com", host: "a.com", text: "body", read: true }] });
    expect(b).toContain("[1] T (a.com)");
    expect(b).toContain("untrusted");
    expect(b).toContain("<<<SOURCES");
  });
});
