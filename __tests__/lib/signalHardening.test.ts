import { describe, it, expect } from "vitest";
import { countSignups, isDisposableEmail, MAX_PER_VISITOR, BURST_CAP } from "@/lib/signupGuard";
import { confirmSignup, observedSince, recordConfirm, recordSignup, type SignalLink } from "@/lib/signalLinks";
import { observedNote, resolveSignal } from "@/lib/signalResolve";
import { checkRedditThread, parseRedditPostId, parseRedditThread, redditOwnershipCode, verifyRedditProof } from "@/lib/redditProof";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const link: SignalLink = { id: "l1", user_id: "owner", code: "abcd2345", kind: "interest", target_url: null, headline: "h", pitch: null, label: null };

/** Tiny in-memory table with the chain methods the code uses. */
function db(tables: Record<string, any[]>, opts: { insertError?: { code: string } } = {}) {
  const ops: any[] = [];
  return {
    ops,
    from(t: string) {
      return {
        insert: async (row: any) => { ops.push({ t, row }); if (opts.insertError) return { error: opts.insertError }; tables[t].push({ id: `id${tables[t].length}`, ...row }); return { error: null }; },
        select() {
          const f: Array<(r: any) => boolean> = [];
          const run = () => tables[t].filter((r) => f.every((x) => x(r)));
          const chain: any = {
            eq: (k: string, v: any) => { f.push((r) => r[k] === v); return chain; },
            in: (k: string, v: any[]) => { f.push((r) => v.includes(r[k])); return chain; },
            not: (k: string, _op: string, v: any) => { f.push((r) => (r[k] ?? null) !== v); return chain; },
            gte: (k: string, v: any) => { f.push((r) => String(r[k]) >= v); return chain; },
            limit: () => chain,
            maybeSingle: async () => ({ data: run()[0] ?? null }),
            then: (res: any) => res({ data: run(), count: run().length, error: null }),
          };
          return chain;
        },
        update(patch: any) {
          const f: Array<(r: any) => boolean> = [];
          const chain: any = {
            eq: (k: string, v: any) => { f.push((r) => r[k] === v); return chain; },
            is: (k: string, v: any) => { f.push((r) => (r[k] ?? null) === v); return chain; },
            then: (res: any) => { tables[t].filter((r) => f.every((x) => x(r))).forEach((r) => Object.assign(r, patch)); return res({ error: null }); },
          };
          return chain;
        },
      };
    },
  } as any;
}

describe("throwaway emails", () => {
  it("refuses known providers and their subdomains, allows normal mail", () => {
    expect(isDisposableEmail("a@mailinator.com")).toBe(true);
    expect(isDisposableEmail("a@x.YOPMAIL.com")).toBe(true);
    expect(isDisposableEmail("a@gmail.com")).toBe(false);
    expect(isDisposableEmail("a@acme.io")).toBe(false);
  });
});

describe("countSignups", () => {
  const t = (m: number) => new Date(Date.UTC(2026, 9, 20, 10, m)).toISOString();
  it("ignores unconfirmed signups", () => {
    expect(countSignups([{ visitor_hash: "a", confirmed_at: null }, { visitor_hash: "b", confirmed_at: t(0) }])).toBe(1);
  });
  it("caps one device", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ visitor_hash: "same", confirmed_at: t(i * 15) }));
    expect(countSignups(rows)).toBe(MAX_PER_VISITOR);
  });
  it("caps a burst inside ten minutes but counts signups spread out", () => {
    const burst = Array.from({ length: 12 }, (_, i) => ({ visitor_hash: `v${i}`, confirmed_at: t(1) }));
    expect(countSignups(burst)).toBe(BURST_CAP);
    const spread = Array.from({ length: 12 }, (_, i) => ({ visitor_hash: `v${i}`, confirmed_at: t(i * 12 % 60) }));
    expect(countSignups(spread)).toBeGreaterThan(BURST_CAP);
  });
  it("handles empty and bad dates", () => {
    expect(countSignups([])).toBe(0);
    expect(countSignups([{ visitor_hash: null, confirmed_at: "nope" }])).toBe(0);
  });
});

describe("signup then confirm", () => {
  it("stores unconfirmed, counts only after the token is used, and a second click is harmless", async () => {
    const tables: Record<string, any[]> = { signal_events: [], signal_links: [] };
    const a = db(tables);
    expect(await recordSignup(a, link, "p@q.co", { visitor: "v1", token: "a".repeat(32) })).toBe("ok");
    expect(await observedSince(a, "owner", "2026-01-01T00:00:00Z")).toEqual([]);
    expect(await confirmSignup(a, "b".repeat(32))).toBe("unknown");
    expect(await confirmSignup(a, "not a token")).toBe("unknown");
    expect(await confirmSignup(a, "a".repeat(32))).toBe("confirmed");
    expect(await confirmSignup(a, "a".repeat(32))).toBe("already");
    expect(await observedSince(a, "owner", "2026-01-01T00:00:00Z")).toEqual([{ kind: "signup", count: 1, source: "page" }]);
  });
  it("refuses a device that keeps starting signups", async () => {
    const tables: Record<string, any[]> = { signal_events: Array.from({ length: 4 }, (_, i) => ({ id: `x${i}`, link_id: "l1", event: "signup", visitor_hash: "v1" })), signal_links: [] };
    expect(await recordSignup(db(tables), link, "n@q.co", { visitor: "v1", token: "c".repeat(32) })).toBe("too_many");
  });
  it("reports duplicate and error", async () => {
    expect(await recordSignup(db({ signal_events: [] }, { insertError: { code: "23505" } }), link, "p@q.co", { visitor: "v", token: "d".repeat(32) })).toBe("duplicate");
    expect(await recordSignup(db({ signal_events: [] }, { insertError: { code: "XX" } }), link, "p@q.co", { visitor: "v", token: "d".repeat(32) })).toBe("error");
  });
});

describe("counterparty confirmation", () => {
  const cl: SignalLink = { ...link, id: "c1", code: "cnfm2345", kind: "confirm", claim_kind: "reply" };
  it("the other person's confirm counts at proof trust; the founder and bots cannot confirm", async () => {
    const tables: Record<string, any[]> = { signal_events: [], signal_links: [{ id: "c1", claim_kind: "reply", kind: "confirm" }] };
    const a = db(tables);
    expect(await recordConfirm(a, cl, { ip: "1.1.1.1", ua: UA, viewerUserId: "owner" })).toBe("owner");
    expect(await recordConfirm(a, cl, { ip: "1.1.1.1", ua: "curl/8" })).toBe("bot");
    expect(tables.signal_events).toHaveLength(0);
    expect(await recordConfirm(a, cl, { ip: "1.1.1.1", ua: UA })).toBe("ok");
    expect(await recordConfirm(a, cl, { ip: "2.2.2.2", ua: UA })).toBe("ok"); // second device, same person: counted once per link
    tables.signal_events.forEach((e) => (e.created_at = "2026-10-20T00:00:00Z"));
    expect(await observedSince(a, "owner", "2026-10-01T00:00:00Z")).toEqual([{ kind: "reply", count: 1, source: "confirm", trust: "proof" }]);
  });
  it("a unique-violation on a repeat device is not an error", async () => {
    expect(await recordConfirm(db({ signal_events: [] }, { insertError: { code: "23505" } }), cl, { ip: "1.1.1.1", ua: UA })).toBe("ok");
  });
  it("resolves at proof trust, and a typed claim without proof cannot beat it", () => {
    const observed = { kind: "reply" as const, count: 1, source: "confirm" as const, trust: "proof" as const };
    const r = resolveSignal({ claimed: { kind: "reply", count: 9, trust: "self" }, proofOk: false, observed });
    expect(r?.signal).toEqual({ kind: "reply", count: 1, trust: "proof" });
    expect(observedNote(observed)).toMatch(/confirmed by the other person/);
  });
});

// A trimmed real-shaped Reddit response.
const thread = (comments: any[], op = "founder1") => [
  { data: { children: [{ kind: "t3", data: { author: op } }] } },
  { data: { children: comments } },
];
const c = (author: string, body: string, replies: any = "") => ({ kind: "t1", data: { author, body, replies } });

describe("Reddit proof", () => {
  it("reads the post id from real link shapes only", () => {
    expect(parseRedditPostId("https://www.reddit.com/r/startups/comments/1abc23/my_post/")).toBe("1abc23");
    expect(parseRedditPostId("https://old.reddit.com/r/x/comments/1abc23")).toBe("1abc23");
    expect(parseRedditPostId("http://reddit.com/r/x/comments/1abc23/t")).toBeNull();
    expect(parseRedditPostId("https://evil.com/r/x/comments/1abc23/t")).toBeNull();
    expect(parseRedditPostId("https://reddit.com/r/startups")).toBeNull();
  });
  it("code depends on user and post", () => {
    expect(redditOwnershipCode("u1", "1abc23", "s")).toMatch(/^bm-[0-9a-f]{8}$/);
    expect(redditOwnershipCode("u1", "1abc23", "s")).not.toBe(redditOwnershipCode("u2", "1abc23", "s"));
    expect(redditOwnershipCode("u1", "1abc23", "s")).not.toBe(redditOwnershipCode("u1", "1abc24", "s"));
  });
  it("parses nested replies and rejects odd shapes", () => {
    const t = parseRedditThread(thread([c("a", "x", { data: { children: [c("b", "y")] } })]));
    expect(t?.comments.map((x) => x.author)).toEqual(["a", "b"]);
    expect(parseRedditThread({})).toBeNull();
    expect(parseRedditThread([{ data: { children: [] } }, {}])).toBeNull();
  });
  it("asks for the code until the post's author has posted it", () => {
    const t = parseRedditThread(thread([c("a", "nice"), c("b", "bm-12345678")]))!; // someone else posting the code proves nothing
    expect(checkRedditThread(t, "bm-12345678")).toEqual({ status: "needs_code", code: "bm-12345678" });
  });
  it("counts distinct other commenters once ownership is shown, ignoring the author, deleted and bots", () => {
    const t = parseRedditThread(thread([
      c("Founder1", "my proof bm-12345678"),
      c("a", "1"), c("A", "again"), c("b", "2", { data: { children: [c("founder1", "thanks"), c("c", "3")] } }),
      c("[deleted]", ""), c("AutoModerator", "rules"), c("helper_bot", "x"),
    ]))!;
    expect(checkRedditThread(t, "bm-12345678")).toEqual({ status: "verified", count: 3 });
  });
  it("verifyRedditProof reports unavailable when Reddit cannot be read and not_reddit for other links", async () => {
    expect(await verifyRedditProof("u", "https://example.com/x", async () => null)).toEqual({ status: "not_reddit" });
    expect(await verifyRedditProof("u", "https://www.reddit.com/r/a/comments/1abc23/t/", async () => null)).toEqual({ status: "unavailable" });
    const code = redditOwnershipCode("u", "1abc23");
    const ok = await verifyRedditProof("u", "https://www.reddit.com/r/a/comments/1abc23/t/", async () => parseRedditThread(thread([c("founder1", code), c("z", "hi")])));
    expect(ok).toEqual({ status: "verified", count: 1 });
  });
});
