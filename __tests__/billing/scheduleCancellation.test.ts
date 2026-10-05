import { describe, it, expect, vi, beforeEach } from "vitest";

let subRow: Record<string, unknown> | null = null;
const upserts: Record<string, unknown>[] = [];

vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { user_metadata: {} } }, error: null }),
        updateUserById: async () => ({ error: null }),
      },
    },
    from: (table: string) => {
      if (table !== "subscriptions") return {};
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: subRow, error: null }) }) }),
        upsert: async (row: Record<string, unknown>) => {
          upserts.push(row);
          return { error: null };
        },
      };
    },
  }),
}));

import { scheduleCancellation, clearScheduledCancellation, startPaymentGrace } from "../../lib/billing/server";

const future = new Date(Date.now() + 10 * 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

function baseRow(over: Record<string, unknown> = {}) {
  return {
    plan: "builder", status: "active", provider: "polar",
    provider_subscription_id: "sub_1", provider_customer_id: "cus_1", provider_reference: "ref_1",
    current_period_start: new Date(Date.now() - 20 * 86400000).toISOString(),
    current_period_end: future, canceled_at: null, amount_minor: 1500, currency: "USD", ...over,
  };
}

beforeEach(() => { upserts.length = 0; subRow = baseRow(); });

describe("scheduleCancellation", () => {
  it("keeps Builder until period end and preserves provider fields", async () => {
    const r = await scheduleCancellation("u1", { reason: "x" });
    expect(r.decision.mode).toBe("until_period_end");
    expect(r.alreadyScheduled).toBe(false);
    const row = upserts[0];
    expect(row.plan).toBe("builder");
    expect(row.status).toBe("active");
    expect(row.current_period_end).toBe(future);
    expect(row.canceled_at).toBeTruthy();
    expect(row.provider_subscription_id).toBe("sub_1");
    expect(row.provider).toBe("polar");
  });
  it("is idempotent: second call reports alreadyScheduled and keeps the first canceled_at", async () => {
    const first = new Date(Date.now() - 3600000).toISOString();
    subRow = baseRow({ canceled_at: first });
    const r = await scheduleCancellation("u1");
    expect(r.alreadyScheduled).toBe(true);
    expect(upserts[0].canceled_at).toBe(first);
  });
  it("drops to free immediately when the period already ended", async () => {
    subRow = baseRow({ current_period_end: past });
    const r = await scheduleCancellation("u1");
    expect(r.decision.mode).toBe("immediate");
    expect(upserts[0].plan).toBe("free");
    expect(upserts[0].status).toBe("canceled");
  });
});

describe("clearScheduledCancellation", () => {
  it("resumes while the period is running", async () => {
    subRow = baseRow({ canceled_at: new Date().toISOString() });
    expect(await clearScheduledCancellation("u1")).toBe(true);
    expect(upserts[0].canceled_at).toBeNull();
    expect(upserts[0].plan).toBe("builder");
    expect(upserts[0].current_period_end).toBe(future);
  });
  it("refuses once the period has ended", async () => {
    subRow = baseRow({ canceled_at: new Date().toISOString(), current_period_end: past });
    expect(await clearScheduledCancellation("u1")).toBe(false);
    expect(upserts).toHaveLength(0);
  });
  it("does nothing when nothing is scheduled", async () => {
    expect(await clearScheduledCancellation("u1")).toBe(false);
  });
});

describe("startPaymentGrace", () => {
  it("keeps Builder in grace for a few days", async () => {
    const ends = await startPaymentGrace("u1", { reason: "payment_failed" });
    const row = upserts[0];
    expect(row.plan).toBe("builder");
    expect(row.status).toBe("grace");
    expect(row.grace_period_ends_at).toBe(ends);
    expect(new Date(ends).getTime()).toBeGreaterThan(Date.now() + 2 * 86400000);
  });
});
