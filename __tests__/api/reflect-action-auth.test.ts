/**
 * __tests__/api/reflect-action-auth.test.ts
 *
 * Tests the auth + usage guard added in Fix 1b (reflect-action route).
 * Does NOT test the Groq call — that's mocked out.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGroqJSON = vi.fn();

vi.mock("../../app/api/ai/_planCheck", () => ({
  getRouteUser: vi.fn(),
}));

vi.mock("../../app/api/ai/_utils", () => ({
  enforceAndTrackAIUsage: vi.fn().mockResolvedValue(undefined),
  groqJSON: mockGroqJSON,
  hasAdminEnv: vi.fn(() => false),
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

import { POST } from "../../app/api/ai/reflect-action/route";
import { getRouteUser } from "../../app/api/ai/_planCheck";
import { enforceAndTrackAIUsage } from "../../app/api/ai/_utils";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

const BASE_BODY = {
  outcome: "completed",
  note: "Shipped the landing page",
  confidence: 4,
  stage: "MVP",
  todayAction: "Write landing page copy",
  streak: 3,
};

function makeReq(body = BASE_BODY) {
  return new Request("https://example.com/api/ai/reflect-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRouteUser).mockResolvedValue({ plan: "free", userId: "user-reflect" });
  mockGroqJSON.mockResolvedValue({
    causality: "Because you shipped → tomorrow goes deeper.",
    nextAction: "Send the link to one warm lead.",
    identityLine: "You're someone who ships.",
  });
});

describe("POST /api/ai/reflect-action — auth guard (Fix 1b)", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getRouteUser).mockResolvedValue(null);
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.success).toBe(false);
  });

  it("returns 200 with data when authenticated", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it("calls enforceAndTrackAIUsage with the authenticated userId", async () => {
    await POST(makeReq());
    expect(enforceAndTrackAIUsage).toHaveBeenCalledWith("user-reflect");
  });

  it("returns 429 when usage limit reached", async () => {
    vi.mocked(enforceAndTrackAIUsage).mockRejectedValueOnce(new Error("Limit reached"));
    const res = await POST(makeReq());
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(body.success).toBe(false);
    expect(body.upgradeUrl).toBe("/upgrade");
  });

  it("returns fallback data when Groq call fails", async () => {
    mockGroqJSON.mockRejectedValueOnce(new Error("Groq error"));
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    // Falls back to FALLBACKS.completed — causality should be defined
    expect(typeof (body.data as Record<string, unknown>)?.causality).toBe("string");
  });

  it("returns correct fallback for 'blocked' outcome", async () => {
    mockGroqJSON.mockRejectedValueOnce(new Error("Groq error"));
    const res = await POST(makeReq({ ...BASE_BODY, outcome: "blocked" }));
    const body = await json(res);
    const data = body.data as Record<string, string>;
    expect(data.identityLine).toContain("blockers");
  });
});
