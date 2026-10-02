import { describe, it, expect, vi, beforeEach } from "vitest";

type RpcResult = { data?: unknown; error?: { code?: string; message: string } | null };
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>();
let tables: Record<string, { data: unknown; error?: { message: string } | null }> = {};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (n: string, a: Record<string, unknown>) => rpc(n, a),
    from: (t: string) => {
      const q: any = { select: () => q, eq: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve(tables[t] ?? { data: [], error: null }).then(r) };
      return q;
    },
  }),
}));

import { spendAIUsage, readAIUsage } from "@/lib/server/aiUsageStore";

const args = { userId: "u1", feature: "general" as const, month: "2026-10", today: "2026-10-02", monthlyLimit: 30, dailyLimit: 3 };
const missing = { code: "PGRST202", message: "Could not find the function public.bm_ai_usage_spend" };

describe("spendAIUsage", () => {
  beforeEach(() => { rpc.mockReset(); tables = {}; });

  it("counts through the per-bucket function and forwards the bucket", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, monthly: 4, daily: 2 }, error: null });
    expect(await spendAIUsage(args)).toMatchObject({ ok: true, monthly: 4, mode: "v2" });
    expect(rpc).toHaveBeenCalledWith("bm_ai_usage_spend", expect.objectContaining({ p_feature: "general", p_monthly_limit: 30, p_daily_limit: 3 }));
  });

  it("reports which cap blocked", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, blocked: "monthly" }, error: null });
    expect(await spendAIUsage(args)).toEqual({ ok: false, blocked: "monthly" });
  });

  it("falls back to the legacy counters (still counted) when the new function is not deployed", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: missing });          // bm_ai_usage_spend
    rpc.mockResolvedValueOnce({ data: 2, error: null });                // daily
    rpc.mockResolvedValueOnce({ data: 11, error: null });               // monthly
    expect(await spendAIUsage(args)).toMatchObject({ ok: true, monthly: 11, mode: "legacy" });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["bm_ai_usage_spend", "increment_ai_usage_daily_capped", "increment_ai_usage_capped"]);
    // the legacy functions have no p_feature argument
    expect(rpc.mock.calls[1][1]).not.toHaveProperty("p_feature");
  });

  it("legacy path hands the daily slot back when the monthly cap blocks", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: missing });
    rpc.mockResolvedValueOnce({ data: 1, error: null });
    rpc.mockResolvedValueOnce({ data: -1, error: null });
    rpc.mockResolvedValueOnce({ data: 0, error: null });
    expect(await spendAIUsage(args)).toEqual({ ok: false, blocked: "monthly" });
    expect(rpc.mock.calls.at(-1)?.[0]).toBe("decrement_ai_usage_daily");
  });

  it("throws on a real database error so the caller can fail closed", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "connection reset" } });
    await expect(spendAIUsage(args)).rejects.toThrow("connection reset");
  });
});

describe("readAIUsage", () => {
  beforeEach(() => { rpc.mockReset(); tables = {}; });

  it("sums per-bucket rows and uses the real limits", async () => {
    tables.ai_usage_by_month = { data: [{ feature: "general", count: 26 }, { feature: "core", count: 10 }], error: null };
    tables.ai_usage = { data: [], error: null };
    const u = await readAIUsage("u1", "free");
    expect(u.general).toEqual({ used: 26, limit: 30, remaining: 4 });
    expect(u.core).toEqual({ used: 10, limit: 45, remaining: 35 });
  });

  it("legacy table: reads count OR call_count (the mismatch behind '30 left' forever)", async () => {
    tables.ai_usage_by_month = { data: null, error: { message: "relation does not exist" } };
    tables.ai_usage = { data: [{ count: 0, call_count: 0 }, { count: 7 }], error: null };
    expect((await readAIUsage("u1", "free")).general.used).toBe(7);
    tables.ai_usage = { data: [{ call_count: 9 }], error: null };
    expect((await readAIUsage("u1", "free")).general.used).toBe(9);
  });
});
