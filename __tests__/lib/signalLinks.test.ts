import { describe, it, expect } from "vitest";
import { makeCode, isValidCode, isBotUserAgent, visitorHash, validateTarget, validEmail, recordVisit, type SignalLink } from "@/lib/signalLinks";

const link: SignalLink = { id: "l1", user_id: "owner", code: "abcd2345", kind: "link", target_url: "https://x.com/a", headline: null, pitch: null, label: null };
const REAL_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1";

describe("codes", () => {
  it("makes valid, different codes", () => {
    const a = makeCode(); const b = makeCode();
    expect(isValidCode(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(isValidCode("../etc")).toBe(false);
    expect(isValidCode("ABC")).toBe(false);
  });
});

describe("bots and visitors", () => {
  it("treats previews, scripts and empty agents as bots", () => {
    for (const ua of ["", "curl/8.0", "WhatsApp/2.23", "Mozilla/5.0 (compatible; Googlebot/2.1)", "facebookexternalhit/1.1", "python-requests/2.31", "Slackbot-LinkExpanding 1.0"]) expect(isBotUserAgent(ua)).toBe(true);
    expect(isBotUserAgent(REAL_UA)).toBe(false);
    // Real people opening the link inside the LinkedIn or X app must still count.
    expect(isBotUserAgent(REAL_UA + " [LinkedInApp]/9.30")).toBe(false);
  });
  it("hashes the same visitor to the same value and different ones apart, without exposing the IP", () => {
    const a = visitorHash("1.2.3.4", REAL_UA, "abcd2345", "s");
    expect(a).toBe(visitorHash("1.2.3.4", REAL_UA, "abcd2345", "s"));
    expect(a).not.toBe(visitorHash("1.2.3.5", REAL_UA, "abcd2345", "s"));
    expect(a).not.toContain("1.2.3.4");
  });
});

describe("validateTarget / validEmail", () => {
  it("allows only public https pages that are not BuildMind", () => {
    expect(validateTarget("https://my-startup.com/launch").ok).toBe(true);
    for (const own of ["https://buildmind.live", "https://www.buildmind.live/", "https://buildmind.live/try?utm_source=x"]) expect(validateTarget(own).ok).toBe(true);
    for (const loop of ["https://buildmind.live/r/abcd2345", "https://buildmind.live/api/user/export", "https://www.buildmind.live/v/abcd2345", "https://buildmind.live/i/abcd2345"]) expect(validateTarget(loop).ok).toBe(false);
    for (const bad of ["http://a.com/x", "https://localhost/x", "https://10.0.0.1/x", "javascript:alert(1)", "not a url", "https://u:p@a.com/x"]) expect(validateTarget(bad).ok).toBe(false);
  });
  it("validates emails", () => {
    expect(validEmail(" Kwame@Example.com ")).toBe("kwame@example.com");
    expect(validEmail("nope")).toBeNull();
  });
});

function fakeAdmin(opts: { insertError?: { code?: string } | null; counts?: Record<string, number> } = {}) {
  const inserted: any[] = [];
  return {
    inserted,
    from: () => ({
      insert: async (row: any) => { inserted.push(row); return { error: opts.insertError ?? null }; },
      select: () => {
        const filters: Record<string, unknown> = {};
        const chain: any = {
          eq: (k: string, v: unknown) => { filters[k] = v; return chain; },
          gte: async () => ({ count: opts.counts?.[String(filters.event)] ?? 0, error: null }),
        };
        return chain;
      },
    }),
  } as any;
}

describe("recordVisit", () => {
  it("counts a real visitor", async () => {
    const a = fakeAdmin();
    expect(await recordVisit(a, link, { ip: "1.1.1.1", ua: REAL_UA })).toBe(true);
    expect(a.inserted[0]).toMatchObject({ event: "visit", user_id: "owner" });
    expect(a.inserted[0].visitor_hash).not.toContain("1.1.1.1");
  });
  it("ignores bots and the founder's own visits", async () => {
    const a = fakeAdmin();
    expect(await recordVisit(a, link, { ip: "1.1.1.1", ua: "curl/8" })).toBe(false);
    expect(await recordVisit(a, link, { ip: "1.1.1.1", ua: REAL_UA, viewerUserId: "owner" })).toBe(false);
    expect(a.inserted).toHaveLength(0);
  });
  it("a repeat visitor (unique violation) is not counted again", async () => {
    expect(await recordVisit(fakeAdmin({ insertError: { code: "23505" } }), link, { ip: "1.1.1.1", ua: REAL_UA })).toBe(false);
  });
});

