/**
 * __tests__/billing/paddle-verify.test.ts
 *
 * Tests for app/api/billing/paddle/verify/route.ts
 *
 * Strategy: mock Supabase auth (server), persistUserPlan, and global fetch
 * so the route's guard logic, Paddle API call, and plan persistence are
 * tested in isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("@/lib/billing/server", () => ({
  persistUserPlan: vi.fn().mockResolvedValue({ plan: "builder", metadata: {} }),
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

// Use vi.hoisted so mockGetUser is available inside the vi.mock factory
const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

import { POST } from "../../app/api/billing/paddle/verify/route";
import { persistUserPlan } from "@/lib/billing/server";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(body: object): Request {
  return new Request("https://example.com/api/billing/paddle/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

function mockUser(email = "founder@example.com", id = "user-paddle-123") {
  mockGetUser.mockResolvedValue({
    data: { user: { id, email } },
    error: null,
  });
}

function mockPaddleResponse(status: number, body: object) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  );
}

const COMPLETED_PADDLE_RESPONSE = {
  data: {
    id: "txn_paddle_abc",
    status: "completed",
    customer_id: "cus_abc",
    custom_data: null,
    details: { totals: { total: "2900", currency_code: "USD" } },
  },
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/billing/paddle/verify", () => {
  beforeEach(() => {
    process.env.PADDLE_API_KEY = "test_paddle_api_key";
    vi.clearAllMocks();
    mockUser();
  });

  // ── Environment guard ───────────────────────────────────────────────────

  it("returns 500 when PADDLE_API_KEY is missing", async () => {
    delete process.env.PADDLE_API_KEY;
    mockPaddleResponse(200, COMPLETED_PADDLE_RESPONSE);
    const req = makeRequest({ transactionId: "txn_abc" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(String(body.error)).toMatch(/PADDLE_API_KEY/);
  });

  // ── Auth guard ──────────────────────────────────────────────────────────

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockPaddleResponse(200, COMPLETED_PADDLE_RESPONSE);
    const req = makeRequest({ transactionId: "txn_abc" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 500 when Supabase auth throws", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "DB connection error" },
    });
    const req = makeRequest({ transactionId: "txn_abc" });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  // ── Input validation ────────────────────────────────────────────────────

  it("returns 400 when transactionId is missing", async () => {
    mockPaddleResponse(200, COMPLETED_PADDLE_RESPONSE);
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(String(body.error)).toMatch(/transaction/i);
  });

  it("returns 400 when transactionId is empty string", async () => {
    mockPaddleResponse(200, COMPLETED_PADDLE_RESPONSE);
    const req = makeRequest({ transactionId: "   " });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── Paddle API errors ───────────────────────────────────────────────────

  it("returns 400 when Paddle API call fails", async () => {
    mockPaddleResponse(404, { error: [{ detail: "Transaction not found" }] });
    const req = makeRequest({ transactionId: "txn_bad" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(String(body.error)).toContain("Transaction not found");
  });

  it("returns 400 when Paddle returns no data", async () => {
    mockPaddleResponse(200, { data: null });
    const req = makeRequest({ transactionId: "txn_null" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── Transaction status checks ───────────────────────────────────────────

  it("returns 409 when transaction is not yet completed", async () => {
    mockPaddleResponse(200, {
      data: { ...COMPLETED_PADDLE_RESPONSE.data, status: "pending" },
    });
    const req = makeRequest({ transactionId: "txn_pending" });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(String(body.error)).toMatch(/not completed/i);
  });

  it("returns 409 when transaction status is refunded", async () => {
    mockPaddleResponse(200, {
      data: { ...COMPLETED_PADDLE_RESPONSE.data, status: "refunded" },
    });
    const req = makeRequest({ transactionId: "txn_refunded" });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it("upgrades user to builder on completed transaction", async () => {
    mockPaddleResponse(200, COMPLETED_PADDLE_RESPONSE);
    const req = makeRequest({ transactionId: "txn_paddle_abc" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.plan).toBe("builder");
  });

  it("also accepts 'paid' as a valid status (Paddle sends both)", async () => {
    mockPaddleResponse(200, {
      data: { ...COMPLETED_PADDLE_RESPONSE.data, status: "paid" },
    });
    const req = makeRequest({ transactionId: "txn_paid" });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("calls persistUserPlan with correct args on success", async () => {
    mockPaddleResponse(200, COMPLETED_PADDLE_RESPONSE);
    const req = makeRequest({ transactionId: "txn_paddle_abc" });
    await POST(req);
    expect(persistUserPlan).toHaveBeenCalledWith(
      "user-paddle-123",
      "builder",
      expect.objectContaining({
        provider: "paddle",
        status: "active",
        transactionId: "txn_paddle_abc",
        customerEmail: "founder@example.com",
      }),
    );
  });

  it("uses Paddle's returned transaction id over the submitted one", async () => {
    mockPaddleResponse(200, {
      data: { ...COMPLETED_PADDLE_RESPONSE.data, id: "txn_canonical_id" },
    });
    const req = makeRequest({ transactionId: "txn_submitted_id" });
    await POST(req);
    expect(persistUserPlan).toHaveBeenCalledWith(
      expect.any(String),
      "builder",
      expect.objectContaining({ transactionId: "txn_canonical_id" }),
    );
  });

  it("normalises customer email to lowercase", async () => {
    mockUser("Founder@EXAMPLE.COM", "user-case-test");
    mockPaddleResponse(200, COMPLETED_PADDLE_RESPONSE);
    const req = makeRequest({ transactionId: "txn_case" });
    await POST(req);
    expect(persistUserPlan).toHaveBeenCalledWith(
      "user-case-test",
      "builder",
      expect.objectContaining({ customerEmail: "founder@example.com" }),
    );
  });
});
