import { describe, it, expect } from "vitest";
import { channelSummary, inferSource, needsTrackedLink, isLinkSource } from "@/lib/linkNudge";
import { evaluateInbound, parseAddress, codeFromRecipients } from "@/lib/inboundReply";
import { observedSince } from "@/lib/signalLinks";
import { parseThreadUrl, parseHnItem, parseDevtoThread, verifyThreadProof, threadCode } from "@/lib/threadProof";
import { checkRedditThread } from "@/lib/redditProof";
import { observedNote } from "@/lib/signalResolve";

describe("channel tags and nudge", () => {
  it("infers the channel a task names", () => {
    expect(inferSource("Post your launch thread on X and ask for feedback")).toBe("x");
    expect(inferSource("Send 5 DMs on LinkedIn")).toBe("linkedin");
    expect(inferSource("Share it in r/startups")).toBe("reddit");
    expect(inferSource("Message 3 people on WhatsApp")).toBe("whatsapp");
    expect(inferSource("Post on Indie Hackers")).toBe("indiehackers");
    expect(inferSource("Show HN: submit it")).toBe("hn");
    expect(inferSource("Write the pricing page")).toBeNull();
    expect(isLinkSource("tiktok")).toBe(true);
    expect(isLinkSource("myspace")).toBe(false);
  });
  it("nudges on outreach tasks only", () => {
    expect(needsTrackedLink("Send your idea to 5 target customers and ask what they use today.")).toBe(true);
    expect(needsTrackedLink("Refactor the billing module")).toBe(false);
    expect(needsTrackedLink("")).toBe(false);
  });
  it("summarises per channel, best first, dropping empty channels", () => {
    const s = channelSummary([
      { source: "x", kind: "link", visits: 40, signups: 0 },
      { source: "linkedin", kind: "interest", visits: 10, signups: 4 },
      { source: "whatsapp", kind: "confirm", visits: 0, signups: 0, confirmed: true },
      { source: "reddit", kind: "link", visits: 0, signups: 0 },
      { kind: "link", visits: 2, signups: 0 },
    ]);
    expect(s.map((c) => c.source)).toEqual(["linkedin", "x", "whatsapp", "untagged"]);
  });
});

describe("inbound reply decision", () => {
  const base = { to: "reply+abcd2345@in.buildmind.live", from: "Ama <ama@acme.io>", subject: "Re: hi", spf: "pass" };
  it("parses addresses and codes", () => {
    expect(parseAddress("Ama <AMA@acme.io>")).toBe("ama@acme.io");
    expect(parseAddress("garbage")).toBeNull();
    expect(codeFromRecipients(["x@y.co", "Reply+ABCD2345@in.buildmind.live"])).toBe("abcd2345");
    expect(codeFromRecipients("a@b.co")).toBeNull();
  });
  it("counts an authenticated reply from someone else", () => {
    expect(evaluateInbound(base, "me@founder.io")).toEqual({ ok: true, code: "abcd2345", sender: "ama@acme.io" });
    expect(evaluateInbound({ ...base, spf: undefined, dkim: "pass" }, null).ok).toBe(true);
  });
  it("refuses unauthenticated, own, automated and throwaway mail", () => {
    expect(evaluateInbound({ ...base, spf: "fail" }, null)).toMatchObject({ ok: false });
    expect(evaluateInbound({ ...base, spf: undefined }, null)).toMatchObject({ ok: false });
    expect(evaluateInbound({ ...base, from: "me@founder.io" }, "ME@founder.io")).toMatchObject({ ok: false, reason: "sender is the founder" });
    expect(evaluateInbound({ ...base, from: "mailer-daemon@x.com" }, null)).toMatchObject({ ok: false });
    expect(evaluateInbound({ ...base, subject: "Out of office" }, null)).toMatchObject({ ok: false });
    expect(evaluateInbound({ ...base, from: "a@mailinator.com" }, null)).toMatchObject({ ok: false });
    expect(evaluateInbound({ ...base, to: "other@x.com" }, null)).toMatchObject({ ok: false });
  });
  it("replies at the address are observed at proof trust, once per sender and burst-capped", async () => {
    const rows = [{ confirmed_at: "2026-10-20T10:00:00Z" }, { confirmed_at: "2026-10-20T11:00:00Z" }];
    const chain: any = { eq: () => chain, not: () => chain, gte: () => chain, limit: () => chain, then: (r: any) => r({ data: rows, count: 0, error: null }) };
    const admin: any = { from: () => ({ select: () => chain }) };
    const o = await observedSince(admin, "u", "2026-10-01T00:00:00Z");
    expect(o).toContainEqual({ kind: "reply", count: 2, source: "inbox", trust: "proof" });
    expect(observedNote({ kind: "reply", count: 2, source: "inbox", trust: "proof" })).toMatch(/replied to your BuildMind reply address/);
  });
});

const hn = { author: "founder", children: [
  { author: "founder", text: "proof CODE", children: [] },
  { author: "ann", text: "<p>nice</p>", children: [{ author: "bob", text: "agree", children: [] }, { author: "founder", text: "thx", children: [] }] },
  { author: null, text: null, children: [] },
] };

describe("Hacker News and dev.to", () => {
  it("routes links to the right platform", () => {
    expect(parseThreadUrl("https://news.ycombinator.com/item?id=12345")).toEqual({ platform: "hn", id: "12345" });
    expect(parseThreadUrl("https://news.ycombinator.com/item?id=abc")).toBeNull();
    expect(parseThreadUrl("https://dev.to/ama/my-post-1a2b")).toEqual({ platform: "devto", user: "ama", slug: "my-post-1a2b" });
    expect(parseThreadUrl("https://dev.to/t/javascript")).toBeNull();
    expect(parseThreadUrl("https://dev.to/ama")).toBeNull();
    expect(parseThreadUrl("http://dev.to/ama/x")).toBeNull();
    expect(parseThreadUrl("https://www.reddit.com/r/a/comments/1abc23/t/")).toEqual({ platform: "reddit", id: "1abc23" });
    expect(parseThreadUrl("https://www.indiehackers.com/post/x")).toBeNull();
  });
  it("parses an HN tree and counts distinct others once the code is posted by the author", () => {
    const t = parseHnItem(hn)!;
    expect(t.comments).toHaveLength(5);
    expect(checkRedditThread(t, "CODE")).toEqual({ status: "verified", count: 2 });
    expect(parseHnItem({})).toBeNull();
  });
  it("parses dev.to and strips html", () => {
    const t = parseDevtoThread({ user: { username: "ama" } }, [
      { user: { username: "ama" }, body_html: "<p>bm-code1</p>", children: [] },
      { user: { username: "kofi" }, body_html: "<p>hi</p>", children: [{ user: { username: "esi" }, body_html: "x", children: [] }] },
    ])!;
    expect(t.comments[0].body).toContain("bm-code1");
    expect(checkRedditThread(t, "bm-code1")).toEqual({ status: "verified", count: 2 });
    expect(parseDevtoThread({}, [])).toBeNull();
  });
  it("verify: unsupported link, unavailable site, needs code, verified", async () => {
    expect(await verifyThreadProof("u", "https://example.com/x")).toEqual({ status: "not_supported" });
    expect(await verifyThreadProof("u", "https://news.ycombinator.com/item?id=9", async () => null)).toEqual({ status: "unavailable", platform: "hn" });
    expect(await verifyThreadProof("u", "https://news.ycombinator.com/item?id=9", async () => parseHnItem(hn))).toMatchObject({ status: "needs_code", platform: "hn" });
    const code = threadCode("u", { platform: "hn", id: "9" });
    const withCode = { ...hn, children: [{ author: "founder", text: code, children: [] }, { author: "z", text: "yo", children: [] }] };
    expect(await verifyThreadProof("u", "https://news.ycombinator.com/item?id=9", async () => parseHnItem(withCode))).toEqual({ status: "verified", count: 1, platform: "hn" });
    expect(threadCode("u", { platform: "hn", id: "9" })).not.toBe(threadCode("u", { platform: "hn", id: "10" }));
  });
});
