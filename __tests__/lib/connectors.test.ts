import { describe, it, expect } from "vitest";
import { checkStripeKey, monthlyMinor, summariseStripe, stripeFacts } from "@/lib/integrations/stripe";
import { checkGithubInput, cleanShipped, summariseGithub, githubFacts } from "@/lib/integrations/github";
import { encryptSecret, decryptSecret } from "@/lib/integrations/crypto";
import { guardReply } from "@/lib/prep/reply";

describe("stripe", () => {
  it("rejects full secret keys and accepts restricted keys", () => {
    expect(checkStripeKey("sk_live_" + "a".repeat(24)).ok).toBe(false);
    expect(checkStripeKey("rk_live_" + "a".repeat(24))).toEqual({ ok: true, mode: "live" });
    expect(checkStripeKey("rk_test_" + "a".repeat(24))).toEqual({ ok: true, mode: "test" });
    expect(checkStripeKey("nonsense").ok).toBe(false);
  });
  it("normalises subscription prices to a month", () => {
    expect(monthlyMinor({ unit_amount: 1200, currency: "usd", recurring: { interval: "year", interval_count: 1 } })).toBe(100);
    expect(monthlyMinor({ unit_amount: 3000, currency: "usd", recurring: { interval: "month", interval_count: 3 } })).toBe(1000);
    expect(monthlyMinor({ unit_amount: 500, currency: "usd", recurring: { interval: "month", interval_count: 1 } }, 3)).toBe(1500);
    expect(monthlyMinor({ unit_amount: 500, currency: "usd", recurring: null })).toBe(0);
  });
  it("sums MRR per currency, counts only active paying customers, never mixes currencies", () => {
    const item = (amt: number, cur: string) => ({ quantity: 1, price: { unit_amount: amt, currency: cur, recurring: { interval: "month", interval_count: 1 } } });
    const s = summariseStripe(
      [
        { customer: "c1", status: "active", items: { data: [item(2900, "usd")] } },
        { customer: "c2", status: "active", items: { data: [item(2900, "usd")] } },
        { customer: "c3", status: "canceled", items: { data: [item(9900, "usd")] } },
        { customer: "c4", status: "active", items: { data: [item(1000, "eur")] } },
      ],
      [
        { amount: 2900, amount_refunded: 0, currency: "usd", paid: true, status: "succeeded" },
        { amount: 2900, amount_refunded: 2900, currency: "usd", paid: true, status: "succeeded" },
        { amount: 500, currency: "usd", paid: false, status: "failed" },
      ],
      "live",
    );
    expect(s.mrr).toEqual({ usd: 58, eur: 10 });
    expect(s.payingCustomers).toBe(3);
    expect(s.last30d).toEqual({ usd: 29 });
    expect(s.paymentsLast30d).toBe(1);
    const f = stripeFacts(s);
    expect(f[0].value).toContain("$58");
    expect(f[0].value).toContain("€10");
  });
  it("handles zero-decimal currencies and marks truncated and test data", () => {
    const s = summariseStripe([{ customer: "c", status: "active", items: { data: [{ quantity: 1, price: { unit_amount: 5000, currency: "jpy", recurring: { interval: "month" } } }] } }], [], "test", new Date(), true);
    expect(s.mrr).toEqual({ jpy: 5000 });
    const f = stripeFacts(s);
    expect(f[0].label).toContain("test mode");
    expect(f[1].value.endsWith("+")).toBe(true);
  });
});

describe("github", () => {
  it("validates token and repo shape", () => {
    expect(checkGithubInput("github_pat_" + "a".repeat(30), "me/app").ok).toBe(true);
    expect(checkGithubInput("ghp_" + "a".repeat(30), "me/app").ok).toBe(true);
    expect(checkGithubInput("abc", "me/app").ok).toBe(false);
    expect(checkGithubInput("ghp_" + "a".repeat(30), "just-a-name").ok).toBe(false);
  });
  it("cleans commit-style prefixes", () => {
    expect(cleanShipped("feat(today): add prepared work panel")).toBe("add prepared work panel");
    expect(cleanShipped("Fix: stale cache on Today")).toBe("stale cache on Today");
  });
  it("counts only pulls merged in the last 30 days and dedupes titles", () => {
    const now = new Date("2026-10-19T00:00:00Z");
    const s = summariseGithub("me/app", 42, [
      { title: "feat: add the Today panel", merged_at: "2026-10-10T00:00:00Z" },
      { title: "Add the Today panel", merged_at: "2026-10-09T00:00:00Z" },
      { title: "old work that was merged ages ago", merged_at: "2026-08-01T00:00:00Z" },
      { title: "closed but never merged", merged_at: null },
      { title: "x", merged_at: "2026-10-11T00:00:00Z" },
    ], now);
    expect(s.mergedPRs30d).toBe(3);
    expect(s.shipped).toEqual(["add the Today panel"]);
    expect(githubFacts(s)[0].value).toBe("42");
  });
});

describe("secret storage", () => {
  it("round-trips and never stores plain text", () => {
    process.env.INTEGRATIONS_KEY = "test-secret";
    const enc = encryptSecret("rk_live_abc");
    expect(enc.startsWith("enc1:")).toBe(true);
    expect(enc).not.toContain("rk_live_abc");
    expect(decryptSecret(enc)).toBe("rk_live_abc");
    expect(decryptSecret("legacy-plain-token")).toBe("legacy-plain-token");
    expect(decryptSecret(enc.slice(0, -3) + "AAA")).toBeNull();
  });
});

describe("reply guard", () => {
  const theirs = "Sounds interesting, but we already use a spreadsheet. How is this different?";
  it("keeps a quote only if they really wrote it", () => {
    const ok = guardReply({ read: "question", summary: "Asks how it differs.", quote: "we already use a spreadsheet", reply: "Fair. The spreadsheet shows what you planned; BuildMind shows what you skipped. Want a look at one real example?", nextStep: "Send an example." }, theirs, "other");
    expect(ok.quote).toBe("we already use a spreadsheet");
    expect(ok.reply).toContain("spreadsheet");
    const bad = guardReply({ read: "interested", summary: "x", quote: "I would love to buy it today", reply: "Great, thanks." }, theirs, "other");
    expect(bad.quote).toBe("");
  });
  it("drops replies with stock phrases and unknown reads fall back to unclear", () => {
    const r = guardReply({ read: "excited", summary: "s", reply: "I hope this finds you well. Let me pick your brain." }, theirs, "other");
    expect(r.reply).toBe("");
    expect(r.read).toBe("unclear");
  });
});
