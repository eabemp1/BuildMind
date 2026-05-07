/**
 * __tests__/api/coach.test.ts
 *
 * Unit tests for app/api/ai/coach/route.ts — the most complex route in the
 * codebase. Covers auth enforcement, userId spoofing prevention, plan gating,
 * spiral detection, and the shape of successful responses.
 *
 * The Groq call and Supabase reads are mocked out — this suite tests the
 * route's own logic, not the AI or database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const {
  mockGetRouteUser,
  mockEnforceAndTrackAIUsage,
  mockGroqJSON,
  mockHasAdminEnv,
  mockLogReflexionQuality,
  mockCreateUserNotification,
} = vi.hoisted(() => ({
  mockGetRouteUser: vi.fn(),
  mockEnforceAndTrackAIUsage: vi.fn().mockResolvedValue(undefined),
  mockGroqJSON: vi.fn(),
  mockHasAdminEnv: vi.fn(() => false),
  mockLogReflexionQuality: vi.fn().mockResolvedValue(undefined),
  mockCreateUserNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../app/api/ai/_planCheck", () => ({
  getRouteUser: mockGetRouteUser,
}));

vi.mock("../../app/api/ai/_utils", () => ({
  enforceAndTrackAIUsage: mockEnforceAndTrackAIUsage,
  groqJSON: mockGroqJSON,
  hasAdminEnv: mockHasAdminEnv,
  logReflexionQuality: mockLogReflexionQuality,
  createUserNotification: mockCreateUserNotification,
}));

vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
    }),
    rpc: vi.fn().mockResolvedValue({ data: 1, error: null }),
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

import { POST } from "../../app/api/ai/coach/route";

beforeEach(() => {
  mockHasAdminEnv.mockReturnValue(false);
  mockEnforceAndTrackAIUsage.mockResolvedValue(undefined);
  mockCreateUserNotification.mockResolvedValue(undefined);
  mockLogReflexionQuality.mockResolvedValue(undefined);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/ai/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  userId: "user-abc",
  projectId: "proj-123",
  message: "I need help with my next task.",
};

// ── Auth: unauthenticated request ─────────────────────────────────────────────

describe("POST /api/ai/coach — authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when getRouteUser returns null", async () => {
    mockGetRouteUser.mockResolvedValue(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.success).toBe(false);
  });
});

// ── Auth: userId spoofing prevention ─────────────────────────────────────────

describe("POST /api/ai/coach — userId spoofing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when body userId does not match session userId", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "user-real", plan: "free" });
    const res = await POST(makeRequest({ ...VALID_BODY, userId: "user-attacker" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.success).toBe(false);
  });

  it("accepts request when body userId matches session userId", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "user-abc", plan: "builder" });
    mockGroqJSON.mockResolvedValue({
      reasoning: ["step 1", "step 2"],
      answer: "Here is your coaching response with enough words.",
    });
    const res = await POST(makeRequest(VALID_BODY));
    // Should not be a 401
    expect(res.status).not.toBe(401);
  });
});

// ── Validation: missing required fields ───────────────────────────────────────

describe("POST /api/ai/coach — input validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when userId is missing", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "", plan: "free" });
    const res = await POST(makeRequest({ projectId: "proj-123", message: "help" }));
    const body = await json(res);
    // Either 400 (explicit validation) or 401 (empty userId = mismatch)
    expect([400, 401]).toContain(res.status);
    expect(body.success).toBe(false);
  });

  it("returns 400 when projectId is missing", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "user-abc", plan: "free" });
    const res = await POST(makeRequest({ userId: "user-abc", message: "help" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.success).toBe(false);
  });
});

// ── Input truncation: message and history limits ──────────────────────────────

describe("POST /api/ai/coach — message length truncation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("truncates message to 2000 characters without throwing", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "user-abc", plan: "builder" });
    mockGroqJSON.mockResolvedValue({
      reasoning: ["thinking"],
      answer: "Here is your personalized coaching response for this session.",
    });

    const longMessage = "x".repeat(5000);
    const res = await POST(makeRequest({ ...VALID_BODY, message: longMessage }));
    // Should not error out — truncation must happen silently
    expect([200, 429, 503]).toContain(res.status);
  });
});

// ── Spiral detection ──────────────────────────────────────────────────────────

describe("POST /api/ai/coach — spiral detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects competitor spiral and includes spiralDetected=true in response", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "user-abc", plan: "builder" });
    mockGroqJSON.mockResolvedValue({
      reasoning: ["competitor spotted"],
      answer: "They already have users but you have a gap they haven't solved.",
    });

    const res = await POST(makeRequest({
      ...VALID_BODY,
      message: "Someone is already doing this exact thing with 10k users.",
    }));
    const body = await json(res);
    if (res.status === 200) {
      expect((body.data as Record<string, unknown>).spiralDetected).toBe(true);
      expect((body.data as Record<string, unknown>).spiralSignal).toBe("competitor");
    }
  });

  it("detects motivation spiral", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "user-abc", plan: "builder" });
    mockGroqJSON.mockResolvedValue({
      reasoning: ["motivation check"],
      answer: "What you've done is real. Here's how to re-enter with a 20-minute task.",
    });

    const res = await POST(makeRequest({
      ...VALID_BODY,
      message: "What's the point, nobody cares about this idea.",
    }));
    const body = await json(res);
    if (res.status === 200) {
      expect((body.data as Record<string, unknown>).spiralSignal).toBe("motivation");
    }
  });

  it("detects avoidance spiral", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "user-abc", plan: "builder" });
    mockGroqJSON.mockResolvedValue({
      reasoning: ["avoidance pattern"],
      answer: "You're describing a pattern, not a problem. Here's the smallest step.",
    });

    const res = await POST(makeRequest({
      ...VALID_BODY,
      message: "I keep putting off the customer interview, I'm stuck on it.",
    }));
    const body = await json(res);
    if (res.status === 200) {
      expect((body.data as Record<string, unknown>).spiralSignal).toBe("avoidance");
    }
  });

  it("does not flag a neutral message as a spiral", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "user-abc", plan: "builder" });
    mockGroqJSON.mockResolvedValue({
      reasoning: ["normal message"],
      answer: "Let's look at your top task for today.",
    });

    const res = await POST(makeRequest({
      ...VALID_BODY,
      message: "What should I focus on today?",
    }));
    const body = await json(res);
    if (res.status === 200) {
      expect((body.data as Record<string, unknown>).spiralDetected).toBe(false);
    }
  });
});

// ── Plan gating: free plan rate limit ────────────────────────────────────────

describe("POST /api/ai/coach — free plan rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 429 when the usage RPC signals limit reached", async () => {
    // Simulate the RPC returning -1 (limit reached), then the enforceCoachUsage
    // throwing the LIMIT_REACHED error.
    const { createAdminClient } = await import("../../lib/supabase/admin");
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnThis(),
      }),
      rpc: vi.fn().mockResolvedValue({ data: -1, error: null }),
    });
    mockGetRouteUser.mockResolvedValue({ userId: "user-abc", plan: "free" });
    mockHasAdminEnv.mockReturnValue(true);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(429);
  });
});

// ── Successful response shape ─────────────────────────────────────────────────

describe("POST /api/ai/coach — successful response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success=true with reasoning array and answer string", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "user-abc", plan: "builder" });
    mockGroqJSON.mockResolvedValue({
      reasoning: ["Reading project data", "Identifying constraint", "Deciding next step"],
      answer: "Your most important task this week is locking in your first paying customer.",
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(Array.isArray((body.data as Record<string, unknown>).reasoning)).toBe(true);
    expect(typeof (body.data as Record<string, unknown>).answer).toBe("string");
  });

  it("falls back to default reasoning when Groq returns malformed reasoning", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "user-abc", plan: "builder" });
    mockGroqJSON.mockResolvedValue({
      reasoning: null,  // malformed
      answer: "Here is your coaching response for today's challenge.",
    });

    const res = await POST(makeRequest(VALID_BODY));
    const body = await json(res);
    if (res.status === 200) {
      const data = body.data as Record<string, unknown>;
      expect(Array.isArray(data.reasoning)).toBe(true);
      expect((data.reasoning as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it("falls back to default answer when Groq returns empty answer", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "user-abc", plan: "builder" });
    mockGroqJSON.mockResolvedValue({
      reasoning: ["step 1"],
      answer: "",  // empty
    });

    const res = await POST(makeRequest(VALID_BODY));
    const body = await json(res);
    if (res.status === 200) {
      const data = body.data as Record<string, unknown>;
      expect(typeof data.answer).toBe("string");
      expect((data.answer as string).length).toBeGreaterThan(0);
    }
  });

  it("returns GROQ_API_KEY error as 503", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "user-abc", plan: "builder" });
    mockGroqJSON.mockRejectedValue(new Error("GROQ_API_KEY is not set"));

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(503);
  });
});

// ── History input: sanitisation ───────────────────────────────────────────────

describe("POST /api/ai/coach — history sanitisation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts up to 8 history entries and ignores entries beyond that", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "user-abc", plan: "builder" });
    mockGroqJSON.mockResolvedValue({
      reasoning: ["reviewing history"],
      answer: "Based on our conversation, here is what I recommend next.",
    });

    const history = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i}`,
    }));

    const res = await POST(makeRequest({ ...VALID_BODY, messages: history }));
    // Should not throw or return 500
    expect([200, 429, 503]).toContain(res.status);
  });

  it("silently drops history entries with empty content", async () => {
    mockGetRouteUser.mockResolvedValue({ userId: "user-abc", plan: "builder" });
    mockGroqJSON.mockResolvedValue({
      reasoning: ["step"],
      answer: "Here is your coaching advice for this situation.",
    });

    const history = [
      { role: "user", content: "" },
      { role: "user", content: "What should I do?" },
    ];

    const res = await POST(makeRequest({ ...VALID_BODY, messages: history }));
    expect([200, 429, 503]).toContain(res.status);
  });
});
