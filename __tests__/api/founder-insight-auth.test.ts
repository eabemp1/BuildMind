/**
 * __tests__/api/founder-insight-auth.test.ts
 *
 * Tests the auth guard and userId ownership check added to founder-insight
 * (Fix 1d). Does not test the Groq call or Supabase writes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetCurrentUser, mockEnforce } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockEnforce: vi.fn(),
}));

vi.mock("../../lib/data/projects", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("../../app/api/ai/_utils", () => ({
  groqChat: vi.fn().mockResolvedValue("Mocked insight"),
  groqJSON: vi.fn().mockResolvedValue({
    avoidance_zones: [],
    strengths: [],
    personality_tags: [],
    last_insight: "You ship fast but avoid sales.",
    cofounder_style: "execution-coach",
    execution_pattern: "consistent",
  }),
  hasAdminEnv: vi.fn(() => false),
  enforceAndTrackAIUsage: mockEnforce,
}));

vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
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

import { POST } from "../../app/api/ai/founder-insight/route";
import type { NextRequest } from "next/server";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

function makeReq(body: object, headers: Record<string, string> = {}) {
  return new Request("https://example.com/api/ai/founder-insight", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({ id: "user-abc", email: "founder@x.com" });
  mockEnforce.mockResolvedValue(undefined);
});

describe("POST /api/ai/founder-insight — auth + ownership (Fix 1d)", () => {
  it("returns 401 for conversational mode when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await POST(makeReq({ prompt: "What should I focus on?", memory: {} }));
    expect(res.status).toBe(401);
  });

  it("returns insight for conversational mode when authenticated", async () => {
    const res = await POST(makeReq({ prompt: "What should I focus on?", memory: {} }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.insight).toBeDefined();
  });

  it("returns 400 when prompt is missing in conversational mode", async () => {
    const res = await POST(makeReq({ memory: {} }));
    expect(res.status).toBe(400);
  });

  it("calls enforceAndTrackAIUsage for conversational mode", async () => {
    await POST(makeReq({ prompt: "Am I on track?", memory: {} }));
    expect(mockEnforce).toHaveBeenCalledWith("user-abc");
  });

  it("returns 429 when limit reached in conversational mode", async () => {
    mockEnforce.mockRejectedValueOnce(new Error("Limit reached"));
    const res = await POST(makeReq({ prompt: "test", memory: {} }));
    expect(res.status).toBe(429);
  });

  it("synthesis mode: returns 401 when not authenticated and no CRON_SECRET", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await POST(makeReq({ synthesize: true, userId: "user-abc" }));
    expect(res.status).toBe(401);
  });

  it("synthesis mode: returns 403 when requesting a different userId", async () => {
    // authenticated as user-abc but requesting synthesis for user-xyz
    const res = await POST(makeReq({ synthesize: true, userId: "user-xyz" }));
    expect(res.status).toBe(403);
  });

  it("synthesis mode: succeeds when requesting own userId", async () => {
    // hasAdminEnv is false → returns 503, but auth/ownership check passes
    const res = await POST(makeReq({ synthesize: true, userId: "user-abc" }));
    // 503 means admin env not set — ownership check passed (not 403)
    expect(res.status).toBe(503);
  });

  it("synthesis mode: succeeds for cron requests with CRON_SECRET header", async () => {
    process.env.CRON_SECRET = "super-secret";
    const res = await POST(
      makeReq({ synthesize: true, userId: "any-user" }, {
        Authorization: "Bearer super-secret",
      })
    );
    // 503 = admin env not set, but cron auth passed
    expect([200, 503]).toContain(res.status);
    delete process.env.CRON_SECRET;
  });
});
