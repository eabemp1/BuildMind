import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFounderContext = vi.fn();
const mockSubscription = vi.fn();
const mockGetUserById = vi.fn();

vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: (...a: unknown[]) => mockGetUserById(...a),
      },
    },
    from: (table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: () => {
        if (table === "founder_context") return mockFounderContext();
        if (table === "subscriptions") return mockSubscription();
        return Promise.resolve({ data: null, error: null });
      },
    }),
  })),
}));

import { getEffectivePlan } from "../../lib/server/plan";

describe("getEffectivePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    mockFounderContext.mockResolvedValue({ data: null, error: null });
    mockSubscription.mockResolvedValue({ data: null, error: null });
    mockGetUserById.mockResolvedValue({ data: { user: { user_metadata: { plan: "free" } } }, error: null });
  });

  it("grants builder during an active trial", async () => {
    mockFounderContext.mockResolvedValue({
      data: { trial_ends_at: new Date(Date.now() + 86400000).toISOString() },
      error: null,
    });

    await expect(getEffectivePlan("user-123")).resolves.toBe("builder");
  });

  it("grants active builder while the monthly period is current", async () => {
    mockSubscription.mockResolvedValue({
      data: {
        plan: "builder",
        status: "active",
        current_period_end: new Date(Date.now() + 86400000).toISOString(),
        grace_period_ends_at: null,
      },
      error: null,
    });

    await expect(getEffectivePlan("user-123")).resolves.toBe("builder");
  });

  it("falls back to free when the active builder period has ended", async () => {
    mockSubscription.mockResolvedValue({
      data: {
        plan: "builder",
        status: "active",
        current_period_end: new Date(Date.now() - 86400000).toISOString(),
        grace_period_ends_at: null,
      },
      error: null,
    });

    await expect(getEffectivePlan("user-123")).resolves.toBe("free");
  });

  it("only grants grace while the grace date is still in the future", async () => {
    mockSubscription.mockResolvedValue({
      data: {
        plan: "builder",
        status: "grace",
        current_period_end: new Date(Date.now() - 86400000).toISOString(),
        grace_period_ends_at: new Date(Date.now() + 86400000).toISOString(),
      },
      error: null,
    });

    await expect(getEffectivePlan("user-123")).resolves.toBe("builder");

    mockSubscription.mockResolvedValue({
      data: {
        plan: "builder",
        status: "grace",
        current_period_end: new Date(Date.now() - 86400000).toISOString(),
        grace_period_ends_at: new Date(Date.now() - 3600000).toISOString(),
      },
      error: null,
    });

    await expect(getEffectivePlan("user-123")).resolves.toBe("free");
  });
});
