/**
 * __tests__/api/checkout.test.ts
 *
 * Tests for app/api/billing/checkout/route.ts
 *
 * Routing under test: Ghana (GH) pays in GHS through Paystack; everyone
 * else pays in USD through Polar. Auth, rate limit, FX and the founding
 * discount lookup are mocked so only the route's own logic is exercised.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockCreatePolar, mockFounding } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockCreatePolar: vi.fn(),
  mockFounding: vi.fn(),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_founding_member: mockFounding() } }) }) }),
    }),
  }),
}));

vi.mock("../../lib/server/rateLimit", () => ({
  getClientIp: () => "1.2.3.4",
  rateLimitAsync: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../../lib/fx", () => ({
  usdToPesewas: vi.fn(async (usd: number) => ({ pesewas: Math.round(usd * 1500), rateUsed: 15, source: "test" })),
}));

vi.mock("../../lib/billing/polar", () => ({
  createPolarCheckout: (...a: unknown[]) => mockCreatePolar(...a),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json" } }),
  },
}));

import { POST } from "../../app/api/billing/checkout/route";

const json = (res: Response) => res.json() as Promise<Record<string, any>>;
const USER = { id: "user-xyz", email: "founder@example.com" };

function req(country: string | null, body: object = { plan: "builder" }) {
  return new Request("https://example.com/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(country ? { "x-vercel-ip-country": country } : {}) },
    body: JSON.stringify(body),
  });
}

function paystackOk() {
  return new Response(
    JSON.stringify({ status: true, data: { authorization_url: "https://checkout.paystack.com/abc" } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = "sk_test_key";
  process.env.PAYSTACK_BUILDER_PLAN_CODE = "PLN_builder_monthly";
  mockGetUser.mockReset().mockResolvedValue({ data: { user: USER }, error: null });
  mockCreatePolar.mockReset().mockResolvedValue({ url: "https://polar.sh/checkout/xyz" });
  mockFounding.mockReset().mockReturnValue(false);
  fetchMock = vi.fn(async () => paystackOk());
  vi.stubGlobal("fetch", fetchMock);
});

describe("POST /api/billing/checkout", () => {
  it("returns 401 when not signed in", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(req("GH"));
    expect(res.status).toBe(401);
  });

  describe("Ghana (Paystack, GHS)", () => {
    it("returns the Paystack checkout url", async () => {
      const res = await POST(req("GH"));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.url).toBe("https://checkout.paystack.com/abc");
      expect(body.currency).toBe("GHS");
      expect(mockCreatePolar).not.toHaveBeenCalled();
    });

    it("sends user_id, plan and the plan code to Paystack", async () => {
      await POST(req("GH"));
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.paystack.co/transaction/initialize");
      const sent = JSON.parse(String(init.body));
      expect(sent.email).toBe(USER.email);
      expect(sent.currency).toBe("GHS");
      expect(sent.plan).toBe("PLN_builder_monthly");
      expect(sent.metadata.user_id).toBe(USER.id);
      expect(sent.metadata.plan).toBe("builder");
      expect(sent.metadata.founding_member).toBe(false);
    });

    it("points the callback at /upgrade", async () => {
      await POST(req("GH"));
      const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
      expect(sent.callback_url).toMatch(/\/upgrade$/);
    });

    it("flags founding members and charges less", async () => {
      await POST(req("GH"));
      const regular = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).amount;
      fetchMock.mockClear();
      mockFounding.mockReturnValue(true);
      await POST(req("GH"));
      const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
      expect(sent.metadata.founding_member).toBe(true);
      expect(sent.amount).toBeLessThan(regular);
    });

    it("falls back to builder for unknown plan strings", async () => {
      const res = await POST(req("GH", { plan: "enterprise-ultra" }));
      expect(res.status).toBe(200);
      const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
      expect(sent.metadata.plan).toBe("builder");
    });

    it("returns 503 when PAYSTACK_SECRET_KEY is missing", async () => {
      delete process.env.PAYSTACK_SECRET_KEY;
      const res = await POST(req("GH"));
      expect(res.status).toBe(503);
    });

    it("returns 502 with Paystack's message when initialize fails", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ status: false, message: "Card declined" }), { status: 400 }),
      );
      const res = await POST(req("GH"));
      expect(res.status).toBe(502);
      expect((await json(res)).error).toMatch(/Card declined/);
    });
  });

  describe("International (Polar, USD)", () => {
    it("routes non-Ghana traffic to Polar and never calls Paystack", async () => {
      const res = await POST(req("US"));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.url).toBe("https://polar.sh/checkout/xyz");
      expect(body.currency).toBe("USD");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockCreatePolar).toHaveBeenCalledWith(expect.objectContaining({ userId: USER.id, email: USER.email, plan: "builder" }));
    });

    it("also uses Polar when the country is unknown", async () => {
      const res = await POST(req(null));
      expect(res.status).toBe(200);
      expect(mockCreatePolar).toHaveBeenCalled();
    });

    it("passes the founding flag to Polar", async () => {
      mockFounding.mockReturnValue(true);
      await POST(req("US"));
      expect(mockCreatePolar).toHaveBeenCalledWith(expect.objectContaining({ isFoundingMember: true }));
    });

    it("returns 502 when Polar fails", async () => {
      mockCreatePolar.mockRejectedValue(new Error("POLAR_ACCESS_TOKEN is not set"));
      const res = await POST(req("US"));
      expect(res.status).toBe(502);
      expect((await json(res)).error).toMatch(/POLAR_ACCESS_TOKEN/);
    });
  });
});
