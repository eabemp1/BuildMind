/**
 * __tests__/billing/paystack-webhook.test.ts
 *
 * Tests for app/api/billing/paystack/webhook/route.ts
 *
 * Strategy: mock persistUserPlan and resolveUserIdByEmail so we test
 * the route's own logic (signature validation, event routing, user
 * resolution) without hitting Supabase or Paystack.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

// ── Mocks — must be declared before importing the module under test ────────
vi.mock("@/lib/billing/server", () => ({
  persistUserPlan: vi.fn().mockResolvedValue({ plan: "builder", metadata: {} }),
  resolveUserIdByEmail: vi.fn().mockResolvedValue("user-abc-123"),
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

import { POST } from "../../app/api/billing/paystack/webhook/route";
import { persistUserPlan, resolveUserIdByEmail } from "@/lib/billing/server";

// ── Helpers ────────────────────────────────────────────────────────────────

const TEST_SECRET = "test_paystack_secret_key";

function sign(body: string, secret = TEST_SECRET): string {
  return crypto.createHmac("sha512", secret).update(body).digest("hex");
}

function makeRequest(body: object, overrideSignature?: string | null): Request {
  const raw = JSON.stringify(body);
  const sig = overrideSignature !== undefined ? overrideSignature : sign(raw);
  return new Request("https://example.com/api/billing/paystack/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sig !== null ? { "x-paystack-signature": sig } : {}),
    },
    body: raw,
  });
}

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

const CHARGE_SUCCESS = {
  event: "charge.success",
  data: {
    id: 1234567,
    reference: "ref_abc",
    status: "success",
    amount: 44500,
    currency: "GHS",
    customer: { email: "founder@example.com" },
    metadata: { user_id: "user-abc-123" },
    subscription_code: null,
    subscription: null,
  },
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/billing/paystack/webhook", () => {
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = TEST_SECRET;
    process.env.PAYSTACK_AMOUNT_BUILDER = "44500";
    vi.clearAllMocks();
  });

  // ── Environment guard ───────────────────────────────────────────────────

  it("returns 500 when PAYSTACK_SECRET_KEY is missing", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const req = makeRequest(CHARGE_SUCCESS);
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toMatch(/PAYSTACK_SECRET_KEY/);
  });

  // ── Signature validation ────────────────────────────────────────────────

  it("returns 401 when signature is missing", async () => {
    const req = makeRequest(CHARGE_SUCCESS, null);
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 401 when signature is wrong", async () => {
    const req = makeRequest(CHARGE_SUCCESS, "wrong_signature_hex");
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("accepts a correctly signed request", async () => {
    const req = makeRequest(CHARGE_SUCCESS);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  // ── User resolution ─────────────────────────────────────────────────────

  it("uses user_id from metadata when present (no email lookup)", async () => {
    const req = makeRequest(CHARGE_SUCCESS);
    await POST(req);
    expect(resolveUserIdByEmail).not.toHaveBeenCalled();
    expect(persistUserPlan).toHaveBeenCalledWith(
      "user-abc-123",
      "builder",
      expect.objectContaining({ provider: "paystack", status: "active" }),
    );
  });

  it("falls back to email lookup when metadata.user_id is absent", async () => {
    const event = {
      ...CHARGE_SUCCESS,
      data: { ...CHARGE_SUCCESS.data, metadata: {} },
    };
    const req = makeRequest(event);
    await POST(req);
    expect(resolveUserIdByEmail).toHaveBeenCalledWith("founder@example.com");
  });

  it("returns ok=true with ignored when no user is found", async () => {
    vi.mocked(resolveUserIdByEmail).mockResolvedValueOnce(null);
    const event = {
      ...CHARGE_SUCCESS,
      data: { ...CHARGE_SUCCESS.data, metadata: {} },
    };
    const req = makeRequest(event);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.ignored).toBeTruthy();
    expect(persistUserPlan).not.toHaveBeenCalled();
  });

  // ── Event routing ───────────────────────────────────────────────────────

  it("upgrades to builder on charge.success", async () => {
    const req = makeRequest(CHARGE_SUCCESS);
    await POST(req);
    expect(persistUserPlan).toHaveBeenCalledWith(
      "user-abc-123",
      "builder",
      expect.objectContaining({ status: "active" }),
    );
  });

  it("downgrades to free on subscription.disable", async () => {
    const event = { ...CHARGE_SUCCESS, event: "subscription.disable" };
    const req = makeRequest(event);
    await POST(req);
    expect(persistUserPlan).toHaveBeenCalledWith(
      "user-abc-123",
      "free",
      expect.objectContaining({ status: "canceled" }),
    );
  });

  it("downgrades to free on invoice.payment_failed", async () => {
    const event = { ...CHARGE_SUCCESS, event: "invoice.payment_failed" };
    const req = makeRequest(event);
    await POST(req);
    expect(persistUserPlan).toHaveBeenCalledWith(
      "user-abc-123",
      "free",
      expect.objectContaining({ status: "canceled" }),
    );
  });

  it("ignores unhandled events without calling persistUserPlan", async () => {
    const event = { ...CHARGE_SUCCESS, event: "transfer.success" };
    const req = makeRequest(event);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.ignored).toBe("transfer.success");
    expect(persistUserPlan).not.toHaveBeenCalled();
  });

  it("ignores charge.success when amount is below the configured Builder amount", async () => {
    const event = {
      ...CHARGE_SUCCESS,
      data: { ...CHARGE_SUCCESS.data, amount: 1000 },
    };
    const req = makeRequest(event);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ignored).toBe("invalid_charge_payload");
    expect(persistUserPlan).not.toHaveBeenCalled();
  });

  it("ignores charge.success when currency is not GHS", async () => {
    const event = {
      ...CHARGE_SUCCESS,
      data: { ...CHARGE_SUCCESS.data, currency: "USD" },
    };
    const req = makeRequest(event);
    await POST(req);
    expect(persistUserPlan).not.toHaveBeenCalled();
  });

  // ── Payload details ─────────────────────────────────────────────────────

  it("passes reference, transactionId, subscriptionId to persistUserPlan", async () => {
    const event = {
      ...CHARGE_SUCCESS,
      data: {
        ...CHARGE_SUCCESS.data,
        subscription_code: "SUB_abc123",
      },
    };
    const req = makeRequest(event);
    await POST(req);
    expect(persistUserPlan).toHaveBeenCalledWith(
      "user-abc-123",
      "builder",
      expect.objectContaining({
        reference: "ref_abc",
        transactionId: "1234567",
        subscriptionId: "SUB_abc123",
        customerEmail: "founder@example.com",
      }),
    );
  });

  it("handles numeric transaction id by converting to string", async () => {
    const event = { ...CHARGE_SUCCESS, data: { ...CHARGE_SUCCESS.data, id: 9876543 } };
    const req = makeRequest(event);
    await POST(req);
    expect(persistUserPlan).toHaveBeenCalledWith(
      expect.any(String),
      "builder",
      expect.objectContaining({ transactionId: "9876543" }),
    );
  });

  it("handles subscription email fallback in nested subscription object", async () => {
    vi.mocked(resolveUserIdByEmail).mockResolvedValueOnce("user-from-sub");
    const event = {
      event: "charge.success",
      data: {
        id: 999,
        reference: "ref_sub",
        status: "success",
        amount: 44500,
        currency: "GHS",
        customer: null,
        metadata: {}, // no user_id
        subscription_code: null,
        subscription: {
          subscription_code: "SUB_nested",
          status: "active",
          email_token: null,
          customer: { email: "sub-email@example.com" },
        },
      },
    };
    const req = makeRequest(event);
    await POST(req);
    expect(resolveUserIdByEmail).toHaveBeenCalledWith("sub-email@example.com");
    expect(persistUserPlan).toHaveBeenCalledWith("user-from-sub", "builder", expect.anything());
  });
});
