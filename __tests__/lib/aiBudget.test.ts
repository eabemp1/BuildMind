import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { decideBudget, dailyCeiling, summariseLoad, publicBreakCap, TIER_PAUSE_AT } from "@/lib/server/aiBudget";
import { PLAN_DAILY_LIMITS, PLAN_MONTHLY_LIMITS, CORE_DAILY_LIMITS } from "@/lib/aiLimits";
import { normalizeEmail, isDisposableEmail, preflightTrial } from "@/lib/server/trialGuard";

describe("decideBudget", () => {
  it("degrades in order: public, free, trial; never paid", () => {
    const c = 1000;
    expect(decideBudget("free", 500, c).allowed).toBe(true);
    expect(decideBudget("public", 600, c).allowed).toBe(false);
    expect(decideBudget("free", 699, c).allowed).toBe(true);
    expect(decideBudget("free", 700, c).allowed).toBe(false);
    expect(decideBudget("trial", 700, c).allowed).toBe(true);
    expect(decideBudget("trial", 850, c).allowed).toBe(false);
    expect(decideBudget("paid", 999999, c).allowed).toBe(true);
  });
  it("ceiling 0 disables the guard", () => {
    expect(decideBudget("free", 1e9, 0).allowed).toBe(true);
  });
  it("paused messages mention the limit so routes return 429 + upgrade", () => {
    const d = decideBudget("free", 9999, 1000);
    expect(!d.allowed && d.reason.toLowerCase()).toContain("limit reached");
  });
  it("tier order is public < free < trial", () => {
    expect(TIER_PAUSE_AT.public).toBeLessThan(TIER_PAUSE_AT.free);
    expect(TIER_PAUSE_AT.free).toBeLessThan(TIER_PAUSE_AT.trial);
  });
});

describe("config", () => {
  it("reads ceiling from env with safe defaults", () => {
    expect(dailyCeiling({})).toBe(10000);
    expect(dailyCeiling({ AI_DAILY_CEILING: "2500" })).toBe(2500);
    expect(dailyCeiling({ AI_DAILY_CEILING: "0" })).toBe(0);
    expect(dailyCeiling({ AI_DAILY_CEILING: "junk" })).toBe(10000);
    expect(publicBreakCap({})).toBe(300);
    expect(publicBreakCap({ BREAK_PUBLIC_DAILY_CAP: "50" })).toBe(50);
  });
  it("trial limits sit between free and builder", () => {
    expect(PLAN_DAILY_LIMITS.trial).toBeGreaterThan(PLAN_DAILY_LIMITS.free);
    expect(PLAN_DAILY_LIMITS.trial).toBeLessThan(PLAN_DAILY_LIMITS.builder);
    expect(CORE_DAILY_LIMITS.trial).toBeLessThan(CORE_DAILY_LIMITS.builder);
    expect(PLAN_MONTHLY_LIMITS.trial).toBeLessThan(PLAN_MONTHLY_LIMITS.builder);
  });
});

describe("summariseLoad", () => {
  it("totals buckets and reports paused tiers", () => {
    const l = summariseLoad([{ bucket: "paid", calls: 100 }, { bucket: "free", calls: 650 }, { bucket: "public", calls: 50 }], 1000, "2026-10-14");
    expect(l.total).toBe(800);
    expect(l.pct).toBe(80);
    expect(l.pausedTiers).toEqual(["public", "free"]);
    expect(l.status).toBe("degrading");
    expect(summariseLoad([{ bucket: "paid", calls: 900 }], 1000, "d").status).toBe("shedding");
    expect(summariseLoad([], 0, "d").status).toBe("unknown");
  });
});

describe("trial guard", () => {
  it("normalises gmail dots, plus tags and googlemail", () => {
    expect(normalizeEmail("A.B.C+promo@Gmail.com")).toBe("abc@gmail.com");
    expect(normalizeEmail("abc@googlemail.com")).toBe("abc@gmail.com");
    expect(normalizeEmail("Jane+x@company.com")).toBe("jane@company.com");
    expect(normalizeEmail("a.b@company.com")).toBe("a.b@company.com");
  });
  it("flags disposable domains", () => {
    expect(isDisposableEmail("x@mailinator.com")).toBe(true);
    expect(isDisposableEmail("x@gmail.com")).toBe(false);
  });
  it("requires a verified, non-disposable email", () => {
    expect(preflightTrial({ id: "1", email: "a@b.com" })).toEqual({ action: "wait", reason: "email_unverified" });
    expect(preflightTrial({ id: "1", email: "a@mailinator.com", email_confirmed_at: "x" })).toEqual({ action: "deny", reason: "disposable_email" });
    expect(preflightTrial({ id: "1", email: "a@b.com", email_confirmed_at: "x" })).toBeNull();
  });
});
