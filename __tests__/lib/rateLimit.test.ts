/**
 * __tests__/lib/rateLimit.test.ts
 *
 * Tests for lib/server/rateLimit.ts — both paths:
 *   1. Dev / no-Supabase path: falls back to in-memory Map (existing behaviour)
 *   2. Distributed path: uses Supabase RPC rate_limit_check_and_increment
 *
 * Strategy: vi.mock createAdminClient so no real Supabase connection is needed.
 * We control the RPC return value to simulate: allowed, denied, RPC error,
 * and network failure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks — hoisted so they're in scope before the module is imported ─────────

const mockRpc = vi.fn();

vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

// Helper to set/unset env vars that control which path runs
function withSupabaseEnv(fn: () => Promise<void>) {
  return async () => {
    const orig = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    try {
      await fn();
    } finally {
      if (orig.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = orig.url;
      if (orig.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = orig.key;
    }
  };
}

function withoutSupabaseEnv(fn: () => Promise<void>) {
  return async () => {
    const orig = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      await fn();
    } finally {
      if (orig.url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = orig.url;
      if (orig.key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = orig.key;
    }
  };
}

// Import AFTER mocks are registered
import { rateLimitAsync, getClientIp } from "../../lib/server/rateLimit";

// ─────────────────────────────────────────────────────────────────────────────

describe("getClientIp", () => {
  it("reads x-forwarded-for (first value)", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("https://example.com", {
      headers: { "x-real-ip": "9.10.11.12" },
    });
    expect(getClientIp(req)).toBe("9.10.11.12");
  });

  it("returns 'unknown' when no IP headers present", () => {
    const req = new Request("https://example.com");
    expect(getClientIp(req)).toBe("unknown");
  });
});

// ─── Distributed (Supabase RPC) path ─────────────────────────────────────────

describe("rateLimitAsync — distributed path (Supabase configured)", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  afterEach(() => {
    mockRpc.mockReset();
  });

  it(
    "returns ok=true when RPC returns a count within limit",
    withSupabaseEnv(async () => {
      mockRpc.mockResolvedValue({ data: 1, error: null });
      const result = await rateLimitAsync("test-key", 5, 3600_000);
      expect(result.ok).toBe(true);
      expect(result.remaining).toBe(4);
    }),
  );

  it(
    "returns ok=false when RPC returns -1 (limit reached)",
    withSupabaseEnv(async () => {
      mockRpc.mockResolvedValue({ data: -1, error: null });
      const result = await rateLimitAsync("test-key", 5, 3600_000);
      expect(result.ok).toBe(false);
      expect(result.remaining).toBe(0);
    }),
  );

  it(
    "passes correct arguments to the RPC",
    withSupabaseEnv(async () => {
      mockRpc.mockResolvedValue({ data: 1, error: null });
      await rateLimitAsync("break-public:1.2.3.4", 5, 3600_000);
      expect(mockRpc).toHaveBeenCalledWith("rate_limit_check_and_increment", {
        p_key: "break-public:1.2.3.4",
        p_window_sec: 3600,
        p_limit: 5,
      });
    }),
  );

  it(
    "fails open (ok=true) when RPC returns a Supabase error",
    withSupabaseEnv(async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: "relation not found" } });
      const result = await rateLimitAsync("test-key", 5, 3600_000);
      expect(result.ok).toBe(true); // fail-open: never block users due to infra error
    }),
  );

  it(
    "fails CLOSED (ok=false) when failClosed:true and RPC returns an error",
    withSupabaseEnv(async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: "relation not found" } });
      const result = await rateLimitAsync("break-public:1.2.3.4", 5, 3600_000, { failClosed: true });
      expect(result.ok).toBe(false);
      expect(result.remaining).toBe(0);
    }),
  );

  it(
    "fails CLOSED (ok=false) when failClosed:true and network throws",
    withSupabaseEnv(async () => {
      mockRpc.mockRejectedValue(new Error("ECONNREFUSED"));
      const result = await rateLimitAsync("break-public:1.2.3.4", 5, 3600_000, { failClosed: true });
      expect(result.ok).toBe(false);
    }),
  );

  it(
    "fails open when the network call throws",
    withSupabaseEnv(async () => {
      mockRpc.mockRejectedValue(new Error("ECONNREFUSED"));
      const result = await rateLimitAsync("test-key", 5, 3600_000);
      expect(result.ok).toBe(true);
    }),
  );

  it(
    "includes a resetAt timestamp in the future",
    withSupabaseEnv(async () => {
      mockRpc.mockResolvedValue({ data: 1, error: null });
      const before = Date.now();
      const result = await rateLimitAsync("test-key", 5, 3600_000);
      expect(result.resetAt).toBeGreaterThan(before);
    }),
  );
});

// ─── Fallback when Supabase is not configured ─────────────────────────────────

describe("rateLimitAsync — in-memory fallback (Supabase NOT configured)", () => {
  it(
    "uses in-memory Map when env vars are absent",
    withoutSupabaseEnv(async () => {
      const key = `test-no-supabase-${Date.now()}`;
      const result = await rateLimitAsync(key, 3, 60_000);
      expect(result.ok).toBe(true);
      // RPC should NOT have been called
      expect(mockRpc).not.toHaveBeenCalled();
    }),
  );

  it(
    "enforces limits in-memory when Supabase absent",
    withoutSupabaseEnv(async () => {
      const key = `test-inmem-limit-${Date.now()}`;
      await rateLimitAsync(key, 1, 60_000);
      const second = await rateLimitAsync(key, 1, 60_000);
      expect(second.ok).toBe(false);
    }),
  );
});
