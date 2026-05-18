import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { mockGetUser, mockPersistUserPlan } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockPersistUserPlan: vi.fn(),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("../../lib/billing/server", () => ({
  persistUserPlan: mockPersistUserPlan,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { "Content-Type": "application/json" },
      }),
  },
}));

import { POST } from "../../app/api/billing/paystack/verify/route";

const AUTHED_USER = {
  id: "user-123",
  email: "founder@example.com",
};

function makeReq(reference = "ref_123") {
  return new Request("https://example.com/api/billing/paystack/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 200)}` },
    body: JSON.stringify({ reference }),
  }) as unknown as NextRequest;
}

function paystackPayload(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      status: true,
      data: {
        status: "success",
        reference: "ref_123",
        amount: 44500,
        currency: "GHS",
        customer: { email: "founder@example.com" },
        metadata: { user_id: "user-123" },
        subscription_code: "SUB_123",
        subscription: {
          subscription_code: "SUB_123",
          email_token: "email-token",
          plan: { plan_code: "PLN_builder_monthly" },
        },
        ...overrides,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

describe("POST /api/billing/paystack/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYSTACK_SECRET_KEY = "sk_test";
    process.env.PAYSTACK_AMOUNT_BUILDER = "44500";
    process.env.PAYSTACK_BUILDER_PLAN_CODE = "PLN_builder_monthly";
    mockGetUser.mockResolvedValue({ data: { user: AUTHED_USER }, error: null });
    mockPersistUserPlan.mockResolvedValue({ plan: "builder" });
    globalThis.fetch = vi.fn().mockResolvedValue(paystackPayload());
  });

  it("upgrades only the authenticated user when Paystack details match", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockPersistUserPlan).toHaveBeenCalledWith(
      "user-123",
      "builder",
      expect.objectContaining({
        provider: "paystack",
        status: "active",
        subscriptionId: "SUB_123",
        customerEmail: "founder@example.com",
      }),
    );
  });

  it("rejects mismatched metadata user_id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(paystackPayload({ metadata: { user_id: "other-user" } }));
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(mockPersistUserPlan).not.toHaveBeenCalled();
  });

  it("rejects mismatched Paystack customer email", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(paystackPayload({ customer: { email: "other@example.com" } }));
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(mockPersistUserPlan).not.toHaveBeenCalled();
  });

  it("rejects mismatched currency", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(paystackPayload({ currency: "USD" }));
    const res = await POST(makeReq());
    const body = await json(res);
    expect(res.status).toBe(400);
    expect(String(body.error)).toMatch(/Currency mismatch/);
  });
});
