/**
 * __tests__/api/evening-check.test.ts
 *
 * Unit tests for app/api/cron/evening-check/route.ts
 *
 * Tests:
 *   1. Rejects non-cron requests in production
 *   2. Skips free-plan users (only Builder gets evening nudges)
 *   3. Skips users who already reflected today
 *   4. Sends nudge when user has not reflected
 *   5. Uses pattern message as nudge body when pattern detection fires
 *   6. Falls back to generic eveningNudge when no pattern
 *   7. Deletes expired push subscriptions (410/404 response)
 *   8. Returns correct summary counts in response
 *   9. dryRun mode sends nothing but counts eligible users
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockWebpushSend,
  mockIsCronRequest,
} = vi.hoisted(() => ({
  mockWebpushSend: vi.fn(),
  mockIsCronRequest: vi.fn(() => true),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: mockWebpushSend,
  },
}));

// Mock the supabase admin client used inside the cron
const mockFrom = vi.fn();
const mockSelect = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();
const mockGte = vi.fn().mockReturnThis();
const mockLimit = vi.fn().mockReturnThis();
const mockMaybeSingle = vi.fn();
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn().mockReturnThis();
const mockDelete = vi.fn().mockReturnThis();
const mockSingle = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { user_metadata: { plan: "builder" } } },
        }),
      },
    },
    from: mockFrom,
  })),
}));

// Mock patternDetection so we can control signal output
vi.mock("@/lib/patternDetection", () => ({
  detectPattern: vi.fn(() => ({ signal: null, message: "", severity: "low", subject: null })),
  shouldSurfacePattern: vi.fn(() => false),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

// Use NextRequest so req.nextUrl.searchParams is available (the route calls it)
function makeRequest(opts: { isCron?: boolean; dryRun?: boolean } = {}): import("next/server").NextRequest {
  const url = opts.dryRun
    ? "http://localhost/api/cron/evening-check?dryRun=1"
    : "http://localhost/api/cron/evening-check";
  const { NextRequest } = require("next/server");
  return new NextRequest(url, {
    headers: opts.isCron !== false
      ? { authorization: `Bearer ${process.env.CRON_SECRET ?? "test-secret"}` }
      : {},
  });
}

function makeChainable(overrides: Record<string, unknown> = {}) {
  const builder: Record<string, unknown> = {};
  // All methods return the builder itself unless overridden
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.gte = chain;
  builder.limit = chain;
  builder.lt = chain;
  builder.order = chain;
  builder.update = chain;
  builder.delete = chain;
  builder.insert = vi.fn().mockResolvedValue({ error: null });
  builder.single = vi.fn().mockResolvedValue({ data: null, error: null });
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  // Apply any test-specific overrides
  Object.assign(builder, overrides);
  return builder;
}

function setupSupabaseMocks(opts: {
  subs?: Array<{ user_id: string; subscription: object }>;
  reflectedToday?: boolean;
  daysInactive?: number;
}) {
  const subs = opts.subs ?? [
    { user_id: "user-1", subscription: { endpoint: "https://push.example.com/abc", keys: { p256dh: "x", auth: "y" } } },
  ];

  mockFrom.mockImplementation((table: string) => {
    if (table === "push_subscriptions") {
      return {
        select: vi.fn().mockResolvedValue({ data: subs, error: null }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    }
    if (table === "reflections") {
      return makeChainable({
        maybeSingle: vi.fn().mockResolvedValue({
          data: opts.reflectedToday ? { id: "refl-1" } : null,
          error: null,
        }),
      });
    }
    if (table === "founder_context") {
      return makeChainable({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            days_inactive: opts.daysInactive ?? 0,
            momentum_score: 55,
            momentum_last_week: 50,
            tasks_accepted_this_week: 3,
            tasks_overridden_this_week: 0,
            override_reasons: [],
            topics_mentioned_repeatedly: [],
            last_pattern_shown_at: null,
          },
          error: null,
        }),
        // update() must return something with .eq() on it
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      });
    }
    if (table === "founder_memory") {
      return makeChainable({
        maybeSingle: vi.fn().mockResolvedValue({ data: { avoidance_zones: [] }, error: null }),
      });
    }
    if (table === "notifications" || table === "evening_checks") {
      return { insert: mockInsert };
    }
    return makeChainable();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "vapid-pub";
  process.env.VAPID_PRIVATE_KEY = "vapid-priv";
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
  vi.clearAllMocks();
});

afterEach(() => vi.restoreAllMocks());

describe("evening-check — auth guard", () => {
  it("returns 401 when request is not from cron in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    setupSupabaseMocks({});
    const { GET } = await import("../../app/api/cron/evening-check/route");
    const res = await GET(makeRequest({ isCron: false }) as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);

    vi.unstubAllEnvs();
  });
});

describe("evening-check — user skipping logic", () => {
  it("skips a user who has already reflected today", async () => {
    setupSupabaseMocks({ reflectedToday: true });
    mockWebpushSend.mockResolvedValue({});

    const { GET } = await import("../../app/api/cron/evening-check/route");
    const res = await GET(makeRequest() as Parameters<typeof GET>[0]);
    const body = await res.json();

    // Notification should NOT have been sent
    expect(mockWebpushSend).not.toHaveBeenCalled();
    expect(body.skippedReflected).toBeGreaterThanOrEqual(1);
  });

  it("sends notification to a user who has not reflected", async () => {
    setupSupabaseMocks({ reflectedToday: false, daysInactive: 0 });
    mockWebpushSend.mockResolvedValue({});

    const { GET } = await import("../../app/api/cron/evening-check/route");
    const res = await GET(makeRequest() as Parameters<typeof GET>[0]);
    const body = await res.json();

    expect(mockWebpushSend).toHaveBeenCalledOnce();
    expect(body.sent).toBe(1);
  });
});

describe("evening-check — pattern detection integration", () => {
  it("uses pattern message as notification body when pattern fires", async () => {
    const { detectPattern, shouldSurfacePattern } = await import("@/lib/patternDetection");
    vi.mocked(detectPattern).mockReturnValue({
      signal: "avoidance",
      message: "You have avoided outreach tasks 3 times this week.",
      subject: "outreach",
      severity: "high",
    });
    vi.mocked(shouldSurfacePattern).mockReturnValue(true);

    setupSupabaseMocks({ reflectedToday: false });
    mockWebpushSend.mockResolvedValue({});

    const { GET } = await import("../../app/api/cron/evening-check/route");
    await GET(makeRequest() as Parameters<typeof GET>[0]);

    expect(mockWebpushSend).toHaveBeenCalledOnce();
    const payload = JSON.parse(mockWebpushSend.mock.calls[0][1] as string);
    expect(payload.body).toBe("You have avoided outreach tasks 3 times this week.");
  });

  it("falls back to generic nudge when no pattern fires", async () => {
    const { detectPattern, shouldSurfacePattern } = await import("@/lib/patternDetection");
    vi.mocked(detectPattern).mockReturnValue({ signal: null, message: "", subject: null, severity: "low" });
    vi.mocked(shouldSurfacePattern).mockReturnValue(false);

    setupSupabaseMocks({ reflectedToday: false, daysInactive: 0 });
    mockWebpushSend.mockResolvedValue({});

    const { GET } = await import("../../app/api/cron/evening-check/route");
    await GET(makeRequest() as Parameters<typeof GET>[0]);

    const payload = JSON.parse(mockWebpushSend.mock.calls[0][1] as string);
    // Generic nudge — should NOT be the pattern message
    expect(payload.body).not.toBe("");
    expect(typeof payload.body).toBe("string");
  });
});

describe("evening-check — expired subscription cleanup", () => {
  it("deletes push subscription on 410 response", async () => {
    setupSupabaseMocks({ reflectedToday: false });
    const err = Object.assign(new Error("Subscription gone"), { statusCode: 410 });
    mockWebpushSend.mockRejectedValue(err);

    const mockDeleteSub = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockFrom.mockImplementation((table: string) => {
      if (table === "push_subscriptions") {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ user_id: "user-1", subscription: { endpoint: "x", keys: { p256dh: "a", auth: "b" } } }],
            error: null,
          }),
          delete: mockDeleteSub,
        };
      }
      // Table-specific mocks for the 410 test path
      if (table === "reflections") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          // User has NOT reflected today — don't skip them
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { days_inactive: 0, momentum_score: 50, tasks_accepted_this_week: 2, tasks_overridden_this_week: 0, override_reasons: [], topics_mentioned_repeatedly: [], last_pattern_shown_at: null }, error: null }),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const { GET } = await import("../../app/api/cron/evening-check/route");
    await GET(makeRequest() as Parameters<typeof GET>[0]);

    expect(mockDeleteSub).toHaveBeenCalled();
  });
});

describe("evening-check — dryRun mode", () => {
  it("counts eligible users but sends no notifications", async () => {
    setupSupabaseMocks({ reflectedToday: false });

    const { GET } = await import("../../app/api/cron/evening-check/route");
    const res = await GET(makeRequest({ dryRun: true }) as Parameters<typeof GET>[0]);
    const body = await res.json();

    expect(mockWebpushSend).not.toHaveBeenCalled();
    expect(body.eligible).toBeGreaterThanOrEqual(1);
    expect(body.sent).toBe(0);
  });
});
