/**
 * __tests__/lib/planGuard.test.ts
 *
 * Tests for lib/server/planGuard.ts — server-side plan enforcement
 *
 * Covers:
 *   - planMeetsRequirement logic via withPlanGuard outcomes
 *   - 401 when unauthenticated
 *   - 403 when plan is below required tier
 *   - 200 when plan meets requirement
 *   - 403 response body includes required/current fields
 *   - getServerPlan returns free for unauthenticated users
 *
 * Supabase and getFreshPlanForUser are mocked — we test the guard logic,
 * not the auth/database layer.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockGetFreshPlanForUser = vi.fn();
const mockGetEffectivePlan = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    getAll: vi.fn(() => []),
    setAll: vi.fn(),
  })),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("../../lib/server/plan", () => ({
  getFreshPlanForUser: (...args: unknown[]) => mockGetFreshPlanForUser(...args),
  getEffectivePlan: (...args: unknown[]) => mockGetEffectivePlan(...args),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { "Content-Type": "application/json" },
        }),
    },
  };
});

import { withPlanGuard, getServerPlan } from "../../lib/server/planGuard";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq() {
  return new NextRequest("https://example.com/api/test", { method: "POST" });
}

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

const BUILDER_USER = { id: "user-builder", email: "builder@test.com" };
const FREE_USER    = { id: "user-free",    email: "free@test.com"    };

// ── Authentication ────────────────────────────────────────────────────────────

describe("withPlanGuard — authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEffectivePlan.mockImplementation((...args: unknown[]) => mockGetFreshPlanForUser(...args));
  });

  it("returns 401 when getUser returns no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "Not logged in" } });

    const handler = withPlanGuard("builder", async () =>
      NextResponse.json({ ok: true })
    );
    const res = await handler(makeReq());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when getUser returns an error", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "JWT expired" } });

    const handler = withPlanGuard("builder", async () =>
      NextResponse.json({ ok: true })
    );
    const res = await handler(makeReq());
    expect(res.status).toBe(401);
  });
});

// ── Plan gating — insufficient plan ──────────────────────────────────────────

describe("withPlanGuard — plan below required tier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEffectivePlan.mockImplementation((...args: unknown[]) => mockGetFreshPlanForUser(...args));
  });

  it("returns 403 when free user tries to access builder-gated route", async () => {
    mockGetUser.mockResolvedValue({ data: { user: FREE_USER }, error: null });
    mockGetFreshPlanForUser.mockResolvedValue("free");

    const handler = withPlanGuard("builder", async () =>
      NextResponse.json({ ok: true })
    );
    const res = await handler(makeReq());
    expect(res.status).toBe(403);
  });

  it("403 response body includes required and current plan fields", async () => {
    mockGetUser.mockResolvedValue({ data: { user: FREE_USER }, error: null });
    mockGetFreshPlanForUser.mockResolvedValue("free");

    const handler = withPlanGuard("builder", async () =>
      NextResponse.json({ ok: true })
    );
    const res = await handler(makeReq());
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.required).toBe("builder");
    expect(body.current).toBe("free");
    expect(body.error).toBe("Plan upgrade required");
  });
});

// ── Plan gating — sufficient plan ────────────────────────────────────────────

describe("withPlanGuard — plan meets requirement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEffectivePlan.mockImplementation((...args: unknown[]) => mockGetFreshPlanForUser(...args));
  });

  it("calls handler and returns its response when plan matches", async () => {
    mockGetUser.mockResolvedValue({ data: { user: BUILDER_USER }, error: null });
    mockGetFreshPlanForUser.mockResolvedValue("builder");

    const handler = withPlanGuard("builder", async (_req, user, plan) =>
      NextResponse.json({ ok: true, userId: user.id, plan })
    );
    const res = await handler(makeReq());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.userId).toBe("user-builder");
    expect(body.plan).toBe("builder");
  });

  it("free user can access a free-gated route (no guard needed — explicit check)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: FREE_USER }, error: null });
    mockGetFreshPlanForUser.mockResolvedValue("free");

    const handler = withPlanGuard("free", async () =>
      NextResponse.json({ ok: true })
    );
    const res = await handler(makeReq());
    expect(res.status).toBe(200);
  });

  it("builder user can access a free-gated route (builder ≥ free)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: BUILDER_USER }, error: null });
    mockGetFreshPlanForUser.mockResolvedValue("builder");

    const handler = withPlanGuard("free", async () =>
      NextResponse.json({ ok: true })
    );
    const res = await handler(makeReq());
    expect(res.status).toBe(200);
  });
});

// ── Handler receives correct user object ──────────────────────────────────────

describe("withPlanGuard — handler arguments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEffectivePlan.mockImplementation((...args: unknown[]) => mockGetFreshPlanForUser(...args));
  });

  it("passes user id and email to the handler", async () => {
    mockGetUser.mockResolvedValue({ data: { user: BUILDER_USER }, error: null });
    mockGetFreshPlanForUser.mockResolvedValue("builder");

    let receivedUser: { id: string; email?: string } | null = null;
    const handler = withPlanGuard("builder", async (_req, user) => {
      receivedUser = user;
      return NextResponse.json({ ok: true });
    });

    await handler(makeReq());
    expect(receivedUser?.id).toBe("user-builder");
    expect(receivedUser?.email).toBe("builder@test.com");
  });
});

// ── getServerPlan ─────────────────────────────────────────────────────────────

describe("getServerPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEffectivePlan.mockImplementation((...args: unknown[]) => mockGetFreshPlanForUser(...args));
  });

  it("returns free plan and null userId when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await getServerPlan();
    expect(result.plan).toBe("free");
    expect(result.userId).toBeNull();
  });

  it("returns the user's plan and userId when authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: BUILDER_USER }, error: null });
    mockGetFreshPlanForUser.mockResolvedValue("builder");

    const result = await getServerPlan();
    expect(result.plan).toBe("builder");
    expect(result.userId).toBe("user-builder");
  });
});
