/**
 * __tests__/lib/billingServer.test.ts
 *
 * Tests for lib/billing/server.ts
 *
 * Covers:
 *   - getBillingEnvStatus: reflects env var presence correctly
 *   - resolveUserIdByEmail: email lookup + null handling
 *   - getUserPlanById: reads plan from auth metadata
 *   - persistUserPlan: metadata merge, plan write, profiles fallback
 *
 * Supabase admin client is mocked throughout.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase admin mock ───────────────────────────────────────────────────────

const mockGetUserById     = vi.fn();
const mockUpdateUserById  = vi.fn();
const mockProfileUpdate   = vi.fn();
const mockEmailLookup     = vi.fn();
const mockSubscriptionUpsert = vi.fn();

vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById:    (...a: unknown[]) => mockGetUserById(...a),
        updateUserById: (...a: unknown[]) => mockUpdateUserById(...a),
      },
    },
    from: (table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnThis(),
          ilike:  vi.fn().mockReturnThis(),
          maybeSingle: () => mockEmailLookup(),
        };
      }
      if (table === "profiles") {
        return {
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          then:   (cb: (v: unknown) => unknown) => Promise.resolve().then(() => cb(undefined)),
        };
      }
      if (table === "subscriptions") {
        return {
          upsert: (...a: unknown[]) => mockSubscriptionUpsert(...a),
        };
      }
      return {};
    },
  })),
}));

import {
  getBillingEnvStatus,
  resolveUserIdByEmail,
  getUserPlanById,
  persistUserPlan,
} from "../../lib/billing/server";

// ── getBillingEnvStatus ───────────────────────────────────────────────────────

describe("getBillingEnvStatus", () => {
  it("reports false for all keys when env is empty", () => {
    const saved = { ...process.env };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
    delete process.env.PAYSTACK_SECRET_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;

    const status = getBillingEnvStatus();
    expect(status.supabaseUrl).toBe(false);
    expect(status.paystackSecretKey).toBe(false);
    expect(status.groqApiKey).toBe(false);

    Object.assign(process.env, saved);
  });

  it("reports true for keys that are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.PAYSTACK_SECRET_KEY = "sk_test_123";

    const status = getBillingEnvStatus();
    expect(status.supabaseUrl).toBe(true);
    expect(status.paystackSecretKey).toBe(true);

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.PAYSTACK_SECRET_KEY;
  });
});

// ── resolveUserIdByEmail ──────────────────────────────────────────────────────

describe("resolveUserIdByEmail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when email is null", async () => {
    const result = await resolveUserIdByEmail(null);
    expect(result).toBeNull();
  });

  it("returns null when email is undefined", async () => {
    const result = await resolveUserIdByEmail(undefined);
    expect(result).toBeNull();
  });

  it("returns null when email is empty string", async () => {
    const result = await resolveUserIdByEmail("");
    expect(result).toBeNull();
  });

  it("returns the user id when email matches", async () => {
    mockEmailLookup.mockResolvedValue({ data: { id: "user-abc" }, error: null });
    const result = await resolveUserIdByEmail("founder@example.com");
    expect(result).toBe("user-abc");
  });

  it("returns null when no user matches", async () => {
    mockEmailLookup.mockResolvedValue({ data: null, error: null });
    const result = await resolveUserIdByEmail("unknown@example.com");
    expect(result).toBeNull();
  });

  it("throws when Supabase returns an error", async () => {
    mockEmailLookup.mockResolvedValue({ data: null, error: { message: "DB error" } });
    await expect(resolveUserIdByEmail("bad@example.com")).rejects.toThrow("DB error");
  });
});

// ── getUserPlanById ───────────────────────────────────────────────────────────

describe("getUserPlanById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 'builder' when user metadata has plan=builder", async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: { user_metadata: { plan: "builder" } } },
      error: null,
    });
    const plan = await getUserPlanById("user-123");
    expect(plan).toBe("builder");
  });

  it("returns 'free' when user metadata has plan=free", async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: { user_metadata: { plan: "free" } } },
      error: null,
    });
    const plan = await getUserPlanById("user-123");
    expect(plan).toBe("free");
  });

  it("returns 'free' when metadata plan is missing", async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null,
    });
    const plan = await getUserPlanById("user-123");
    expect(plan).toBe("free");
  });

  it("throws when Supabase returns an error", async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: null },
      error: { message: "User not found" },
    });
    await expect(getUserPlanById("bad-id")).rejects.toThrow("User not found");
  });
});

// ── persistUserPlan ───────────────────────────────────────────────────────────

describe("persistUserPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            name: "Ada",
            plan: "free",
          },
        },
      },
      error: null,
    });
    mockUpdateUserById.mockResolvedValue({ error: null });
    mockProfileUpdate.mockResolvedValue(undefined);
    mockSubscriptionUpsert.mockResolvedValue({ error: null });
  });

  it("persists builder plan to user_metadata", async () => {
    await persistUserPlan("user-123", "builder");

    expect(mockUpdateUserById).toHaveBeenCalledWith(
      "user-123",
      expect.objectContaining({
        user_metadata: expect.objectContaining({ plan: "builder" }),
      })
    );
  });

  it("preserves existing metadata fields when updating plan", async () => {
    await persistUserPlan("user-123", "builder");

    const [, payload] = mockUpdateUserById.mock.calls[0] as [string, { user_metadata: Record<string, unknown> }];
    expect(payload.user_metadata.name).toBe("Ada");
  });

  it("sets billing_status to 'active' when upgrading to builder", async () => {
    await persistUserPlan("user-123", "builder");

    const [, payload] = mockUpdateUserById.mock.calls[0] as [string, { user_metadata: Record<string, unknown> }];
    expect(payload.user_metadata.billing_status).toBe("active");
  });

  it("sets billing_status to 'free' when downgrading to free", async () => {
    await persistUserPlan("user-123", "free");

    const [, payload] = mockUpdateUserById.mock.calls[0] as [string, { user_metadata: Record<string, unknown> }];
    expect(payload.user_metadata.billing_status).toBe("free");
  });

  it("writes billing_reference when provided in update", async () => {
    await persistUserPlan("user-123", "builder", {
      reference: "txn_abc123",
    });

    const [, payload] = mockUpdateUserById.mock.calls[0] as [string, { user_metadata: Record<string, unknown> }];
    expect(payload.user_metadata.billing_reference).toBe("txn_abc123");
  });

  it("includes billing_updated_at timestamp", async () => {
    await persistUserPlan("user-123", "builder");

    const [, payload] = mockUpdateUserById.mock.calls[0] as [string, { user_metadata: Record<string, unknown> }];
    expect(typeof payload.user_metadata.billing_updated_at).toBe("string");
    // Should be a valid ISO date
    expect(new Date(payload.user_metadata.billing_updated_at as string).getTime()).toBeGreaterThan(0);
  });

  it("writes monthly period dates when upgrading to active builder", async () => {
    await persistUserPlan("user-123", "builder");

    const [row] = mockSubscriptionUpsert.mock.calls[0] as [Record<string, unknown>];
    expect(row.current_period_start).toEqual(expect.any(String));
    expect(row.current_period_end).toEqual(expect.any(String));

    const start = new Date(row.current_period_start as string).getTime();
    const end = new Date(row.current_period_end as string).getTime();
    expect(end - start).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("honors explicit period dates from the billing provider", async () => {
    await persistUserPlan("user-123", "builder", {
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-07-01T00:00:00.000Z",
    });

    const [row] = mockSubscriptionUpsert.mock.calls[0] as [Record<string, unknown>];
    expect(row.current_period_start).toBe("2026-06-01T00:00:00.000Z");
    expect(row.current_period_end).toBe("2026-07-01T00:00:00.000Z");
  });

  it("throws when getUserById fails", async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: null },
      error: { message: "Not found" },
    });
    await expect(persistUserPlan("bad-id", "builder")).rejects.toThrow("Not found");
  });

  it("throws when updateUserById fails", async () => {
    mockUpdateUserById.mockResolvedValue({ error: { message: "Write failed" } });
    await expect(persistUserPlan("user-123", "builder")).rejects.toThrow("Write failed");
  });

  it("returns the plan and metadata in response", async () => {
    const result = await persistUserPlan("user-123", "builder");
    expect(result.plan).toBe("builder");
    expect(typeof result.metadata).toBe("object");
  });
});
