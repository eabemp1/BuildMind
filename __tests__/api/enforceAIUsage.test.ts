import { describe, it, expect, vi, beforeEach } from "vitest";

const spend = vi.fn();
let plan = "free";
let trial = false;
vi.mock("@/lib/server/aiUsageStore", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/aiUsageStore")>("@/lib/server/aiUsageStore");
  return { ...actual, spendAIUsage: (...a: unknown[]) => spend(...a) };
});
vi.mock("@/lib/server/plan", () => ({ getPlanContext: async () => ({ plan, trial }), getEffectivePlan: async () => plan }));
const checkBudget = vi.fn(async () => ({ allowed: true }) as { allowed: boolean; reason?: string });
vi.mock("@/lib/server/aiBudget", () => ({ checkBudget: (...a: unknown[]) => (checkBudget as any)(...a), recordCall: async () => {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ auth: { admin: { getUserById: async () => ({ data: {} }) } } }) }));

import { enforceAndTrackAIUsage } from "@/app/api/ai/_utils";
import { AIUsageUnavailableError } from "@/lib/server/aiUsageStore";

describe("enforceAndTrackAIUsage", () => {
  beforeEach(() => {
    spend.mockReset();
    plan = "free";
    trial = false;
    checkBudget.mockReset();
    checkBudget.mockResolvedValue({ allowed: true });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  });

  it("spends exactly one call in the right bucket with the plan's real limits", async () => {
    spend.mockResolvedValue({ ok: true, monthly: 1, mode: "v2" });
    await enforceAndTrackAIUsage("u1", undefined, "core");
    expect(spend).toHaveBeenCalledTimes(1);
    expect(spend).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", feature: "core", monthlyLimit: 45, dailyLimit: 6 }));
  });

  it("blocks with a 'limit reached' message at the daily and monthly caps", async () => {
    spend.mockResolvedValueOnce({ ok: false, blocked: "daily" });
    await expect(enforceAndTrackAIUsage("u1")).rejects.toThrow(/Daily AI limit reached/);
    spend.mockResolvedValueOnce({ ok: false, blocked: "monthly" });
    await expect(enforceAndTrackAIUsage("u1")).rejects.toThrow(/Monthly AI limit reached \(30 calls\)/);
  });

  it("free plan fails CLOSED when the counters are unreachable (no free uncounted AI)", async () => {
    spend.mockRejectedValue(new Error("connection reset"));
    await expect(enforceAndTrackAIUsage("u1")).rejects.toBeInstanceOf(AIUsageUnavailableError);
  });

  it("paid plan fails open so an outage never blocks a paying founder", async () => {
    plan = "builder";
    spend.mockRejectedValue(new Error("connection reset"));
    await expect(enforceAndTrackAIUsage("u1")).resolves.toBeUndefined();
  });

  it("trial accounts get the smaller trial allowance, not full Builder limits", async () => {
    plan = "builder"; trial = true;
    spend.mockResolvedValue({ ok: true, monthly: 1, mode: "v2" });
    await enforceAndTrackAIUsage("u1");
    expect(spend).toHaveBeenCalledWith(expect.objectContaining({ dailyLimit: 25, monthlyLimit: 250 }));
    expect(checkBudget).toHaveBeenCalledWith("trial");
  });

  it("paying builders keep full limits and are checked as paid", async () => {
    plan = "builder"; trial = false;
    spend.mockResolvedValue({ ok: true, monthly: 1, mode: "v2" });
    await enforceAndTrackAIUsage("u1");
    expect(spend).toHaveBeenCalledWith(expect.objectContaining({ dailyLimit: 80, monthlyLimit: 1500 }));
    expect(checkBudget).toHaveBeenCalledWith("paid");
  });

  it("global budget pause blocks before any allowance is spent", async () => {
    checkBudget.mockResolvedValue({ allowed: false, reason: "AI capacity limit reached for free accounts right now." });
    await expect(enforceAndTrackAIUsage("u1")).rejects.toThrow(/capacity limit reached/);
    expect(spend).not.toHaveBeenCalled();
  });

  it("trial accounts fail closed when counters are unreachable", async () => {
    plan = "builder"; trial = true;
    spend.mockRejectedValue(new Error("down"));
    await expect(enforceAndTrackAIUsage("u1")).rejects.toBeInstanceOf(AIUsageUnavailableError);
  });
});
