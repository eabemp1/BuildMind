/**
 * __tests__/api/score-history.test.ts
 *
 * Tests for the new /api/user/score-history route (Fix 2 — server-side
 * score persistence).
 *
 * Strategy: mock createClient (server) and createAdminClient so we can
 * test the route's merge logic, auth guard, and response shape without
 * hitting Supabase.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockSelect  = vi.fn();
const mockUpsert  = vi.fn();

// Chain builder: .from().select().eq().maybeSingle() etc.
function buildChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const end = vi.fn().mockResolvedValue(result);
  ["select", "eq", "maybeSingle", "single", "in", "order", "limit"].forEach(m => {
    chain[m] = vi.fn(() => chain);
  });
  chain["then"] = (fn: (v: unknown) => unknown) => Promise.resolve(fn(result));
  Object.assign(chain, { data: (result as { data?: unknown })?.data ?? null, error: null });
  return chain;
}

vi.mock("../../lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "founder_context") {
        return {
          select: mockSelect,
          upsert: mockUpsert,
        };
      }
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) })) })) };
    }),
  })),
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

import { GET, POST } from "../../app/api/user/score-history/route";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

const AUTHED_USER = { id: "user-abc" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: AUTHED_USER } });
  mockSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: { score_history: [] } }),
    }),
  });
  mockUpsert.mockResolvedValue({ data: null, error: null });
});

describe("GET /api/user/score-history", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns history array when authenticated", async () => {
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { score_history: [{ date: "2026-05-01", score: 72 }] },
        }),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Array.isArray(body.history)).toBe(true);
    expect((body.history as unknown[]).length).toBe(1);
  });

  it("returns empty array when no score_history in DB", async () => {
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      }),
    });
    const res = await GET();
    const body = await json(res);
    expect(body.history).toEqual([]);
  });
});

describe("POST /api/user/score-history", () => {
  function makeReq(body: object) {
    return new Request("https://example.com/api/user/score-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({ date: "2026-05-01", score: 60 }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when date is missing", async () => {
    const res = await POST(makeReq({ score: 60 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when score is missing", async () => {
    const res = await POST(makeReq({ date: "2026-05-01" }));
    expect(res.status).toBe(400);
  });

  it("returns ok=true on success", async () => {
    const res = await POST(makeReq({ date: "2026-05-01", score: 74 }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });

  it("calls upsert with merged score_history", async () => {
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { score_history: [{ date: "2026-04-30", score: 65 }] },
        }),
      }),
    });
    await POST(makeReq({ date: "2026-05-01", score: 74 }));
    expect(mockUpsert).toHaveBeenCalled();
    const [upserted] = mockUpsert.mock.calls[0];
    const history = upserted.score_history as Array<{ date: string; score: number }>;
    expect(history.some(h => h.date === "2026-04-30")).toBe(true);
    expect(history.some(h => h.date === "2026-05-01" && h.score === 74)).toBe(true);
  });

  it("server-wins on date conflict (upserted has new score)", async () => {
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { score_history: [{ date: "2026-05-01", score: 50 }] }, // old score
        }),
      }),
    });
    await POST(makeReq({ date: "2026-05-01", score: 80 }));
    const [upserted] = mockUpsert.mock.calls[0];
    const entry = (upserted.score_history as Array<{ date: string; score: number }>)
      .find(h => h.date === "2026-05-01");
    expect(entry?.score).toBe(80); // new score wins
  });
});
