/**
 * __tests__/api/checkout.test.ts
 *
 * Tests for the fixed checkout route (Fix 3 — dead plan branch).
 *
 * Strategy: mock createClient and the Paystack API fetch so we test the
 * route's plan resolution, auth check, and request construction only.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("../../lib/plan", () => ({
  normalizePlan: (p: string | undefined) => {
    if (p === "builder") return "builder";
    return "free";
  },
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

import { POST } from "../../app/api/billing/checkout/route";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

const AUTHED_USER = {
  id: "user-xyz",
  email: "founder@example.com",
};

function paystackSuccess(plan = "builder") {
  return new Response(
    JSON.stringify({
      status: true,
      data: { authorization_url: `https://paystack.com/pay/mock-${plan}` },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function makeReq(body: object = { plan: "builder" }) {
  return new Request("https://example.com/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = "sk_test_key";
  process.env.NEXT_PUBLIC_APP_URL = "https://buildmind.app";
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: AUTHED_USER }, error: null });
  globalThis.fetch = vi.fn().mockResolvedValue(paystackSuccess("builder"));
});

describe("POST /api/billing/checkout — Fix 3 (dead plan branch)", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "Not logged in" } });
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 503 when PAYSTACK_SECRET_KEY is not set", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const res = await POST(makeReq());
    expect(res.status).toBe(503);
  });

  it("creates a builder checkout for { plan: 'builder' }", async () => {
    const res = await POST(makeReq({ plan: "builder" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.plan).toBe("builder");
    expect(body.url).toContain("paystack.com");
  });

  it("passes plan to Paystack metadata (not silently discarded)", async () => {
    await POST(makeReq({ plan: "builder" }));
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse(init!.body as string) as { metadata: { plan: string } };
    expect(sent.metadata.plan).toBe("builder");
  });

  it("defaults to builder for unknown plan strings (safe fallback)", async () => {
    const res = await POST(makeReq({ plan: "enterprise" })); // unknown tier
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.plan).toBe("builder"); // safe default
  });

  it("returns checkout URL in response body", async () => {
    const res = await POST(makeReq({ plan: "builder" }));
    const body = await json(res);
    expect(typeof body.url).toBe("string");
    expect(body.url).toMatch(/^https:\/\//);
  });

  it("returns 502 when Paystack API fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: false, message: "Card declined" }), { status: 400 })
    );
    const res = await POST(makeReq());
    expect(res.status).toBe(502);
    const body = await json(res);
    expect(String(body.error)).toMatch(/Card declined/);
  });

  it("includes user_id in Paystack metadata", async () => {
    await POST(makeReq({ plan: "builder" }));
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse(init!.body as string) as { metadata: { user_id: string } };
    expect(sent.metadata.user_id).toBe("user-xyz");
  });

  it("includes correct callback_url pointing to /upgrade", async () => {
    await POST(makeReq());
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse(init!.body as string) as { callback_url: string };
    expect(sent.callback_url).toContain("/upgrade");
  });
});
