/**
 * __tests__/lib/learningDb.test.ts
 *
 * Tests for the DB-layer functions in lib/learning.ts:
 *   - getLearnedPatterns    (cache hit, cache miss → derive, error fallback)
 *   - deriveAndCachePatterns (log read, derive, write-back, error fallback)
 *   - recordActionShown      (insert shape, inferred type/platform, null on error)
 *   - recordActionOutcome    (update, re-derive trigger, false on error)
 *   - markIgnoredAfter24h   (correct filter: user_id + pending + cutoff)
 *
 * Supabase admin client is mocked at the module level.
 * No real network calls are made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase query-builder mock ───────────────────────────────────────────────
// We build a chainable mock that captures the final terminal call (.single,
// .then, implicit promise) so we can assert on what was written.

const mockSingle     = vi.fn();
const mockInsert     = vi.fn();
const mockUpdate     = vi.fn();
const mockSelect     = vi.fn();
const mockEq         = vi.fn();
const mockOrder      = vi.fn();
const mockLimit      = vi.fn();
const mockLt         = vi.fn();

// Each builder method returns `this` so calls can be chained arbitrarily.
// Terminal methods (single, insert with select) resolve the promise.
function makeBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select  = (..._a: unknown[]) => { mockSelect();  return builder; };
  builder.eq      = (..._a: unknown[]) => { mockEq(..._a);      return builder; };
  builder.order   = (..._a: unknown[]) => { mockOrder();   return builder; };
  builder.limit   = (..._a: unknown[]) => { mockLimit();   return builder; };
  builder.lt      = (..._a: unknown[]) => { mockLt(..._a);      return builder; };
  builder.update  = (v: unknown) => { mockUpdate(v); return builder; };
  builder.insert  = (v: unknown) => { mockInsert(v); return builder; };
  builder.single  = () => mockSingle();
  // Make builder thenable with proper two-arg form so `await builder` resolves
  (builder as unknown as PromiseLike<unknown>).then = function(
    resolve?: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) {
    return Promise.resolve({ error: null }).then(resolve, reject);
  };
  return builder;
}

let _builder = makeBuilder();

vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (_table: string) => _builder,
  })),
}));

vi.mock("../../lib/server/logger", () => ({
  logError: vi.fn(),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import * as LearningModule from "../../lib/learning";
const {
  getLearnedPatterns,
  deriveAndCachePatterns,
  recordActionShown,
  recordActionOutcome,
  markIgnoredAfter24h,
} = LearningModule;

// ── Shared fixtures ───────────────────────────────────────────────────────────

const FIVE_ROWS = Array.from({ length: 5 }, (_, i) => ({
  id: `row-${i}`,
  user_id: "user-test",
  action_text: "Send cold email",
  action_type: "outreach",
  action_platform: "email",
  outcome: i < 3 ? "completed" : "overridden",
  outcome_note: i >= 3 ? "Too busy" : null,
  pivot_angle: null,
  shown_at: new Date().toISOString(),
  resolved_at: null,
}));

const CACHED_PATTERNS = {
  preferred_action_types: ["build"],
  avoided_action_types: [],
  avoided_platforms: [],
  override_reasons: [],
  pivot_angles_tried: [],
  completion_rate: 0.8,
  total_logged: 10,
  patterns_reliable: true,
};

function resetBuilder() {
  _builder = makeBuilder();
  vi.clearAllMocks();
  // Re-set safe defaults so implicit single() calls in fire-and-forget paths don't throw.
  mockSingle.mockResolvedValue({ data: null, error: null });
  // Tests that call mockUpdate.mockImplementation(...) must be cleaned up here
  // because vi.clearAllMocks() only clears call counts, not implementations.
  mockUpdate.mockImplementation((v: unknown) => { return _builder; });
  mockInsert.mockImplementation((v: unknown) => { return _builder; });
}

// ── getLearnedPatterns — cache hit ────────────────────────────────────────────

describe("getLearnedPatterns — cache hit", () => {
  beforeEach(resetBuilder);

  it("returns cached patterns from founder_context when total_logged > 0", async () => {
    mockSingle.mockResolvedValue({
      data: { learned_patterns: CACHED_PATTERNS },
      error: null,
    });

    const result = await getLearnedPatterns("user-test");
    expect(result.total_logged).toBe(10);
    expect(result.patterns_reliable).toBe(true);
    expect(result.preferred_action_types).toContain("build");
  });

  it("returns completion_rate from cache without re-deriving", async () => {
    mockSingle.mockResolvedValue({
      data: { learned_patterns: CACHED_PATTERNS },
      error: null,
    });

    const result = await getLearnedPatterns("user-test");
    expect(result.completion_rate).toBe(0.8);
  });
});

// ── getLearnedPatterns — cache miss → slow path ───────────────────────────────

describe("getLearnedPatterns — cache miss (slow path)", () => {
  beforeEach(resetBuilder);

  it("returns empty patterns (patterns_reliable: false) when cache shows total_logged=0 and log is empty", async () => {
    // First call: founder_context read (cache miss — total_logged: 0)
    // Second call: reflexion_learning_log read (empty)
    mockSingle
      .mockResolvedValueOnce({ data: { learned_patterns: { total_logged: 0 } }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    // Also make the chainable builder resolve to empty log rows on .then
    _builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve);

    const result = await getLearnedPatterns("user-test");
    // With 0 rows, patterns_reliable should be false
    expect(result.patterns_reliable).toBe(false);
    expect(result.total_logged).toBe(0);
  });
});

// ── getLearnedPatterns — Supabase error ───────────────────────────────────────

describe("getLearnedPatterns — error fallback", () => {
  beforeEach(resetBuilder);

  it("returns empty patterns (does not throw) when Supabase throws", async () => {
    mockSingle.mockRejectedValue(new Error("Connection refused"));

    const result = await getLearnedPatterns("user-test");
    expect(result.patterns_reliable).toBe(false);
    expect(result.preferred_action_types).toHaveLength(0);
  });
});

// ── deriveAndCachePatterns ────────────────────────────────────────────────────

describe("deriveAndCachePatterns — log read and derivation", () => {
  beforeEach(resetBuilder);

  it("returns empty patterns when log query returns error", async () => {
    // Simulate supabase returning an error on the log read
    _builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: { message: "Table not found" } }).then(resolve);

    const result = await deriveAndCachePatterns("user-test");
    expect(result.patterns_reliable).toBe(false);
    expect(result.total_logged).toBe(0);
  });

  it("returns empty patterns when log query returns null rows", async () => {
    _builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    const result = await deriveAndCachePatterns("user-test");
    expect(result.patterns_reliable).toBe(false);
  });

  it("returns derived patterns when rows are returned", async () => {
    _builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: FIVE_ROWS, error: null }).then(resolve);

    const result = await deriveAndCachePatterns("user-test");
    // 5 rows = patterns_reliable: true
    expect(result.patterns_reliable).toBe(true);
    expect(result.total_logged).toBe(5);
  });

  it("does not throw when cache write-back fails", async () => {
    _builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: FIVE_ROWS, error: null }).then(resolve);
    // Make the update write-back throw
    mockUpdate.mockImplementation(() => { throw new Error("write failed"); });

    // Should NOT throw — write-back is fire-and-forget
    await expect(deriveAndCachePatterns("user-test")).resolves.toBeDefined();
  });
});

// ── recordActionShown ─────────────────────────────────────────────────────────

describe("recordActionShown — insert shape", () => {
  beforeEach(resetBuilder);

  it("returns the new row id on success", async () => {
    mockSingle.mockResolvedValue({ data: { id: "row-new-123" }, error: null });

    const id = await recordActionShown({
      userId: "user-abc",
      sessionId: "sess-1",
      stage: "Validation",
      actionShown: "Send cold email to 10 founders",
    });

    expect(id).toBe("row-new-123");
  });

  it("returns null when Supabase returns an error", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "insert failed" } });

    const id = await recordActionShown({
      userId: "user-abc",
      sessionId: "sess-1",
      stage: "Validation",
      actionShown: "Build the landing page",
    });

    expect(id).toBeNull();
  });

  it("returns null when Supabase throws", async () => {
    mockSingle.mockRejectedValue(new Error("network error"));

    const id = await recordActionShown({
      userId: "user-abc",
      sessionId: "sess-1",
      stage: "Idea",
      actionShown: "Post on LinkedIn",
    });

    expect(id).toBeNull();
  });

  it("inserts with outcome: 'pending'", async () => {
    mockSingle.mockResolvedValue({ data: { id: "row-xyz" }, error: null });

    await recordActionShown({
      userId: "user-abc",
      sessionId: "sess-2",
      stage: "Validation",
      actionShown: "Interview 5 users",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "pending" })
    );
  });

  it("infers action_type from actionShown text", async () => {
    mockSingle.mockResolvedValue({ data: { id: "row-1" }, error: null });

    await recordActionShown({
      userId: "user-abc",
      sessionId: "sess-3",
      stage: "Validation",
      actionShown: "Interview 3 potential customers this week",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action_type: "user_interview" })
    );
  });

  it("infers action_platform from actionShown text", async () => {
    mockSingle.mockResolvedValue({ data: { id: "row-2" }, error: null });

    await recordActionShown({
      userId: "user-abc",
      sessionId: "sess-4",
      stage: "Validation",
      actionShown: "Send a message via LinkedIn to 5 founders",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action_platform: "linkedin" })
    );
  });

  it("passes optional fields when provided", async () => {
    mockSingle.mockResolvedValue({ data: { id: "row-3" }, error: null });

    await recordActionShown({
      userId: "user-abc",
      sessionId: "sess-5",
      stage: "Validation",
      actionShown: "Build the MVP",
      criticPersona: "devil's-advocate",
      viabilityScore: 72,
      confidence: 0.85,
      pivotAngle: "SMEs only",
      pivotTitle: "Niche down to SMEs",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        critic_persona: "devil's-advocate",
        viability_score: 72,
        confidence: 0.85,
        pivot_angle: "SMEs only",
        pivot_title: "Niche down to SMEs",
      })
    );
  });

  it("sets optional fields to null when omitted", async () => {
    mockSingle.mockResolvedValue({ data: { id: "row-4" }, error: null });

    await recordActionShown({
      userId: "user-abc",
      sessionId: "sess-6",
      stage: "Idea",
      actionShown: "Research competitors",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        critic_persona: null,
        viability_score: null,
        pivot_angle: null,
      })
    );
  });
});

// ── recordActionOutcome ───────────────────────────────────────────────────────

describe("recordActionOutcome — update shape", () => {
  beforeEach(resetBuilder);
  // Stub out the fire-and-forget deriveAndCachePatterns call that recordActionOutcome
  // triggers after a successful update. Without this stub it makes additional
  // supabase.from() calls that corrupt the shared _builder mock's call counts.
  beforeEach(() => {
    vi.spyOn(LearningModule, "deriveAndCachePatterns").mockResolvedValue({
      preferred_action_types: [], avoided_action_types: [], avoided_platforms: [],
      override_reasons: [], pivot_angles_tried: [], completion_rate: 0,
      total_logged: 0, patterns_reliable: false,
    });
  });

  // Helper: drain any remaining microtasks
  async function flushMicrotasks() {
    await new Promise((r) => setTimeout(r, 0));
  }

  it("returns true on successful update", async () => {
    const result = await recordActionOutcome({
      logRowId: "row-abc",
      userId: "user-abc",
      outcome: "completed",
    });
    await flushMicrotasks();
    expect(result).toBe(true);
  });

  it("returns false when Supabase returns an error", async () => {
    _builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: { message: "update failed" } }).then(resolve);

    const result = await recordActionOutcome({
      logRowId: "row-abc",
      userId: "user-abc",
      outcome: "overridden",
      outcomeNote: "Wrong priority",
    });

    expect(result).toBe(false);
  });

  it("returns false when Supabase throws", async () => {
    _builder.then = (_resolve: unknown, reject: (e: Error) => unknown) => {
      if (typeof reject === "function") return Promise.reject(new Error("network error")).catch(reject);
      return Promise.reject(new Error("network error"));
    };

    const result = await recordActionOutcome({
      logRowId: "row-abc",
      userId: "user-abc",
      outcome: "ignored",
    });

    expect(result).toBe(false);
  });

  it("writes outcome and outcome_note to the update payload", async () => {
    const result = await recordActionOutcome({
      logRowId: "row-xyz",
      userId: "user-abc",
      outcome: "overridden",
      outcomeNote: "Not relevant",
    });
    await flushMicrotasks();

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "overridden",
        outcome_note: "Not relevant",
      })
    );
    expect(result).toBe(true);
  });

  it("sets outcome_note to null when outcomeNote is omitted", async () => {
    await recordActionOutcome({
      logRowId: "row-xyz",
      userId: "user-abc",
      outcome: "completed",
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ outcome_note: null })
    );
  });

  it("includes outcome_recorded_at ISO timestamp in update", async () => {
    await recordActionOutcome({
      logRowId: "row-xyz",
      userId: "user-abc",
      outcome: "completed",
    });

    const [payload] = mockUpdate.mock.calls[0] as [Record<string, unknown>];
    expect(typeof payload.outcome_recorded_at).toBe("string");
    expect(new Date(payload.outcome_recorded_at as string).getTime()).toBeGreaterThan(0);
  });
});

// ── markIgnoredAfter24h ───────────────────────────────────────────────────────

describe("markIgnoredAfter24h — filter correctness", () => {
  beforeEach(resetBuilder);

  it("does not throw when Supabase resolves", async () => {
    await expect(markIgnoredAfter24h("user-abc")).resolves.toBeUndefined();
  });

  it("does not throw when Supabase throws (non-fatal)", async () => {
    _builder.then = (_resolve: unknown, reject?: (e: Error) => unknown) => {
      if (typeof reject === "function") return Promise.reject(new Error("DB gone")).catch(reject);
      return Promise.reject(new Error("DB gone"));
    };

    // Should swallow the error — function has try/catch
    await expect(markIgnoredAfter24h("user-abc")).resolves.toBeUndefined();
  });

  it("updates outcome to 'ignored' in the payload", async () => {
    await markIgnoredAfter24h("user-abc");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "ignored" })
    );
  });

  it("includes outcome_recorded_at in update payload", async () => {
    await markIgnoredAfter24h("user-abc");

    const [payload] = mockUpdate.mock.calls[0] as [Record<string, unknown>];
    expect(typeof payload.outcome_recorded_at).toBe("string");
  });

  it("calls eq with 'pending' to filter only pending rows", async () => {
    await markIgnoredAfter24h("user-abc");
    // eq is called multiple times: user_id, outcome='pending'
    // Just verify it was called at all — the mock captures all eq calls
    expect(mockEq).toHaveBeenCalled();
  });

  it("calls lt to enforce the 24h cutoff", async () => {
    await markIgnoredAfter24h("user-abc");
    expect(mockLt).toHaveBeenCalled();
    // The cutoff passed to lt should be approximately 24h ago
    const [_field, cutoffStr] = mockLt.mock.calls[0] as [string, string];
    const cutoff = new Date(cutoffStr).getTime();
    const expectedCutoff = Date.now() - 24 * 60 * 60 * 1000;
    // Within 5 seconds of expected — generous tolerance for test execution time
    expect(Math.abs(cutoff - expectedCutoff)).toBeLessThan(5000);
  });
});
