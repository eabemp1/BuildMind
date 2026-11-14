import { describe, expect, it, vi } from "vitest";

const from = vi.fn(() => ({
  select: () => Object.assign(Promise.resolve({ count: 3, data: [], error: null }), { not: () => Promise.resolve({ data: [], error: null }), eq: () => ({ gte: () => Promise.resolve({ count: 1, error: null }) }) }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from, auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } } }),
}));

describe("getPublicStats", () => {
  it("serves repeat visits from one copy instead of querying every time", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
    const { getPublicStats } = await import("@/lib/server/publicStats");
    await Promise.all([getPublicStats(), getPublicStats()]);
    const after = from.mock.calls.length;
    await getPublicStats();
    expect(after).toBeGreaterThan(0);
    expect(from.mock.calls.length).toBe(after);
  });
});
