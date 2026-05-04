/**
 * __tests__/api/reflexion-strike.test.ts
 *
 * Tests the auth + usage guard added in Fix 1a.
 * Strategy: mock getRouteUser, enforceAndTrackAIUsage, and runReflexionStrike
 * so we test only the route's guard logic — not the AI call.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/api/ai/_planCheck", () => ({
  getRouteUser: vi.fn(),
}));

vi.mock("../../app/api/ai/_utils", () => ({
  enforceAndTrackAIUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/reflexion", () => ({
  runReflexionStrike: vi.fn().mockResolvedValue({
    marketGap: "Mocked gap",
    firstTask: "Mocked task",
    rationale: "Mocked rationale",
  }),
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

import { POST } from "../../app/api/ai/reflexion-strike/route";
import { getRouteUser } from "../../app/api/ai/_planCheck";
import { enforceAndTrackAIUsage } from "../../app/api/ai/_utils";
import { runReflexionStrike } from "../../lib/reflexion";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

function makeReq(body: object = { startupDescription: "A SaaS for accountants", stage: "Idea" }) {
  return new Request("https://example.com/api/ai/reflexion-strike", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRouteUser).mockResolvedValue({ plan: "free", userId: "user-123" });
  vi.mocked(enforceAndTrackAIUsage).mockResolvedValue(undefined);
});

describe("POST /api/ai/reflexion-strike — auth guard (Fix 1a)", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getRouteUser).mockResolvedValue(null);
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toMatch(/[Uu]nauthorized/);
  });

  it("returns 200 with data when authenticated", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
  });

  it("calls enforceAndTrackAIUsage with the correct userId", async () => {
    await POST(makeReq());
    expect(enforceAndTrackAIUsage).toHaveBeenCalledWith("user-123");
  });

  it("returns 429 when usage limit is reached", async () => {
    vi.mocked(enforceAndTrackAIUsage).mockRejectedValueOnce(new Error("Limit reached"));
    const res = await POST(makeReq());
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.upgradeUrl).toBe("/upgrade");
  });

  it("allows through when enforceAndTrackAIUsage throws a non-limit error (DB down)", async () => {
    vi.mocked(enforceAndTrackAIUsage).mockRejectedValueOnce(new Error("Connection refused"));
    const res = await POST(makeReq());
    // DB down should not block the user — graceful degradation
    expect(res.status).toBe(200);
  });

  it("returns 400 when startupDescription is empty", async () => {
    const res = await POST(makeReq({ startupDescription: "   " }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when startupDescription is missing", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("truncates startupDescription to 500 chars before calling runReflexionStrike", async () => {
    const long = "A".repeat(600);
    await POST(makeReq({ startupDescription: long }));
    const [calledDesc] = vi.mocked(runReflexionStrike).mock.calls[0];
    expect(calledDesc.length).toBe(500);
  });

  it("returns graceful fallback when runReflexionStrike throws", async () => {
    vi.mocked(runReflexionStrike).mockRejectedValueOnce(new Error("Groq timeout"));
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.fallback).toBe(true);
    expect(body.data).toBeDefined();
  });
});
