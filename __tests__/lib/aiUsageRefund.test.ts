import { describe, it, expect, vi } from "vitest";

const rows: Record<string, number> = { "ai_usage_by_day": 3, "ai_usage_by_month": 0 };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      let updating = false;
      const chain = new Proxy(q, { get: (_t, prop) => {
        if (prop === "update") return (v: { count: number }) => { updating = true; q.v = v; return chain; };
        if (prop === "maybeSingle") return async () => ({ data: { count: rows[table] } });
        if (prop === "select") return () => (updating ? Promise.resolve({ data: (rows[table] = (q.v as { count: number }).count, [{ count: rows[table] }]) }) : chain);
        return () => chain;
      } });
      return chain;
    },
  }),
}));

import { refundAIUsage, usagePeriods } from "@/lib/server/aiUsageRefund";

describe("refundAIUsage", () => {
  it("builds UTC day and month", () => expect(usagePeriods(new Date("2026-11-16T06:00:00Z"))).toEqual({ month: "2026-11", day: "2026-11-16" }));
  it("takes one off a counter above zero and never goes below zero", async () => {
    const r = await refundAIUsage("u1", "general", new Date("2026-11-16T06:00:00Z"));
    expect(r).toEqual({ day: true, month: false });
    expect(rows.ai_usage_by_day).toBe(2);
    expect(rows.ai_usage_by_month).toBe(0);
  });
});
