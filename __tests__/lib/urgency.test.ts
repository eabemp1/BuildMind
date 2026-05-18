/**
 * __tests__/lib/urgency.test.ts
 *
 * Unit tests for lib/urgency.ts
 *
 * Strategy: urgency.ts reads localStorage and the score history cache from
 * lib/scoring. Both are mocked via globalThis.localStorage and vi.mock so
 * these tests run in Node without a browser.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock lib/scoring (getScoreHistory is the only import urgency.ts needs) ───
vi.mock("../../lib/scoring", () => ({
  getScoreHistory: vi.fn(() => []),
  recordScore: vi.fn(),
}));

// Import from the split modules directly — validates the urgency.ts refactor.
// The barrel shim at lib/urgency.ts also re-exports all of these, so both
// import paths should resolve identically.
import { computeUrgencySignal, getMissedDayCost } from "../../lib/urgency/signal";
import { recordPendingTasks } from "../../lib/urgency/taskDebt";
import { markActiveToday, syncUrgencyFromServer } from "../../lib/urgency/activeDate";
import { getScoreHistory } from "../../lib/scoring";

// ── localStorage mock ─────────────────────────────────────────────────────────

function setupLocalStorage(data: Record<string, string>) {
  const store = new Map(Object.entries(data));
  globalThis.window = {} as Window & typeof globalThis;
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    length: store.size,
  } as Storage;
  return store;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.mocked(getScoreHistory).mockReturnValue([]);
  // Reset fetch mock
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
});

// ── none level ────────────────────────────────────────────────────────────────

describe("computeUrgencySignal: none level", () => {
  it("returns none when active today, no debt, no score drop", () => {
    setupLocalStorage({ bm_last_active_date: todayStr(), bm_streak: "2" });
    const signal = computeUrgencySignal(60);
    expect(signal.level).toBe("none");
  });

  it("returns none when streak is 0 and active today", () => {
    setupLocalStorage({ bm_last_active_date: todayStr(), bm_streak: "0" });
    expect(computeUrgencySignal(50).level).toBe("none");
  });
});

// ── low level ─────────────────────────────────────────────────────────────────

describe("computeUrgencySignal: low level", () => {
  it("returns low when streak ≥ 7 and active today", () => {
    setupLocalStorage({ bm_last_active_date: todayStr(), bm_streak: "7" });
    const signal = computeUrgencySignal(60);
    expect(signal.level).toBe("low");
    expect(signal.headline).toContain("7-day streak");
  });

  it("returns low with 14-day streak and active today", () => {
    setupLocalStorage({ bm_last_active_date: todayStr(), bm_streak: "14" });
    expect(computeUrgencySignal(70).level).toBe("low");
  });
});

// ── medium level ──────────────────────────────────────────────────────────────

describe("computeUrgencySignal: medium level", () => {
  it("returns medium when task debt ≥ 3", () => {
    setupLocalStorage({
      bm_last_active_date: todayStr(),
      bm_task_debt: "3",
      bm_streak: "1",
    });
    const signal = computeUrgencySignal(55);
    expect(signal.level).toBe("medium");
    expect(signal.taskDebt).toBe(3);
  });

  it("returns medium when score dropped 5 pts (momentum drift)", () => {
    setupLocalStorage({ bm_last_active_date: todayStr(), bm_streak: "1" });
    vi.mocked(getScoreHistory).mockReturnValue([
      { date: daysAgoStr(1), score: 60 },
    ]);
    const signal = computeUrgencySignal(55); // dropped 5
    expect(signal.level).toBe("medium");
    expect(signal.momentumDelta).toBe(-5);
  });
});

// ── high level ────────────────────────────────────────────────────────────────

describe("computeUrgencySignal: high level", () => {
  it("returns high when missed yesterday (1 day missed)", () => {
    setupLocalStorage({ bm_last_active_date: daysAgoStr(1), bm_streak: "1" });
    const signal = computeUrgencySignal(60);
    expect(signal.level).toBe("high");
    expect(signal.daysMissed).toBe(1);
  });

  it("returns high with streak message when streak ≥ 3 and missed 1 day", () => {
    setupLocalStorage({ bm_last_active_date: daysAgoStr(1), bm_streak: "5" });
    const signal = computeUrgencySignal(60);
    expect(signal.level).toBe("high");
    expect(signal.headline).toContain("5 days");
  });

  it("returns high when momentum dropped ≥ 10 pts", () => {
    setupLocalStorage({ bm_last_active_date: todayStr(), bm_streak: "3" });
    vi.mocked(getScoreHistory).mockReturnValue([
      { date: daysAgoStr(1), score: 70 },
    ]);
    const signal = computeUrgencySignal(58); // dropped 12
    expect(signal.level).toBe("high");
    expect(signal.momentumDelta).toBe(-12);
  });

  it("high includes task debt in subtext when tasks are pending", () => {
    setupLocalStorage({
      bm_last_active_date: daysAgoStr(1),
      bm_streak: "1",
      bm_task_debt: "4",
    });
    const signal = computeUrgencySignal(60);
    expect(signal.subtext).toContain("4 tasks");
  });
});

// ── critical level ────────────────────────────────────────────────────────────

describe("computeUrgencySignal: critical level", () => {
  it("returns critical when 3 days missed", () => {
    setupLocalStorage({ bm_last_active_date: daysAgoStr(3), bm_streak: "2" });
    const signal = computeUrgencySignal(50);
    expect(signal.level).toBe("critical");
    expect(signal.daysMissed).toBe(3);
    expect(signal.headline).toContain("3 days");
  });

  it("returns critical when 2 days missed with streak ≥ 5 (streak at risk)", () => {
    setupLocalStorage({ bm_last_active_date: daysAgoStr(2), bm_streak: "7" });
    const signal = computeUrgencySignal(55);
    expect(signal.level).toBe("critical");
    expect(signal.headline).toContain("7-day streak");
  });

  it("critical CTA always points to /today", () => {
    setupLocalStorage({ bm_last_active_date: daysAgoStr(5), bm_streak: "0" });
    expect(computeUrgencySignal(40).ctaHref).toBe("/today");
  });
});

// ── field correctness ─────────────────────────────────────────────────────────

describe("computeUrgencySignal: returned fields", () => {
  it("streak field matches bm_streak localStorage value", () => {
    setupLocalStorage({ bm_last_active_date: todayStr(), bm_streak: "12" });
    expect(computeUrgencySignal(60).streak).toBe(12);
  });

  it("taskDebt field matches bm_task_debt localStorage value", () => {
    setupLocalStorage({ bm_last_active_date: todayStr(), bm_task_debt: "7", bm_streak: "1" });
    expect(computeUrgencySignal(60).taskDebt).toBe(7);
  });

  it("momentumDelta is 0 when no history", () => {
    setupLocalStorage({ bm_last_active_date: todayStr(), bm_streak: "1" });
    vi.mocked(getScoreHistory).mockReturnValue([]);
    expect(computeUrgencySignal(60).momentumDelta).toBe(0);
  });
});

// ── getMissedDayCost ──────────────────────────────────────────────────────────

describe("getMissedDayCost", () => {
  const cases: [string, string][] = [
    ["Idea",       "conversation"],
    ["Validation", "competitors"],
    ["MVP",        "feedback"],
    ["Prototype",  "feedback"],   // alias for MVP
    ["Launch",     "Distribution"],
    ["Revenue",    "Churn"],
    ["Growth",     "Churn"],
    ["unknown",    "Momentum"],   // fallback
  ];

  it.each(cases)("stage '%s' → contains '%s'", (stage, expected) => {
    expect(getMissedDayCost(stage)).toContain(expected);
  });
});

// ── markActiveToday ───────────────────────────────────────────────────────────

describe("markActiveToday", () => {
  it("writes today's date to localStorage", () => {
    const store = setupLocalStorage({});
    markActiveToday();
    expect(store.get("bm_last_active_date")).toBe(todayStr());
  });

  it("fires a POST to /api/user/score-history (server persistence)", () => {
    setupLocalStorage({});
    markActiveToday();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/user/score-history",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

// ── recordPendingTasks ────────────────────────────────────────────────────────

describe("recordPendingTasks", () => {
  it("writes task debt when last active was yesterday", () => {
    const store = setupLocalStorage({ bm_last_active_date: daysAgoStr(1) });
    recordPendingTasks(5);
    expect(store.get("bm_task_debt")).toBe("5");
  });

  it("does NOT write task debt when active today", () => {
    const store = setupLocalStorage({ bm_last_active_date: todayStr() });
    recordPendingTasks(5);
    expect(store.get("bm_task_debt")).toBeUndefined();
  });
});

// ── syncUrgencyFromServer ─────────────────────────────────────────────────────

describe("syncUrgencyFromServer", () => {
  it("writes streak from server into localStorage when server streak >= local", async () => {
    const store = setupLocalStorage({ bm_streak: "2" });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, streak: 5, lastCheckinDate: "2025-06-10" }),
    });
    await syncUrgencyFromServer();
    expect(store.get("bm_streak")).toBe("5");
  });

  it("does NOT overwrite a higher local streak with a lower server streak", async () => {
    const store = setupLocalStorage({ bm_streak: "7" });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, streak: 3, lastCheckinDate: "2025-06-01" }),
    });
    await syncUrgencyFromServer();
    // Local streak (7) is ahead of server (3) — don't clobber it
    expect(store.get("bm_streak")).toBe("7");
  });

  it("writes lastCheckinDate as LAST_ACTIVE_KEY when server date is more recent", async () => {
    const store = setupLocalStorage({ bm_last_active_date: "2025-06-01" });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, streak: 4, lastCheckinDate: "2025-06-10" }),
    });
    await syncUrgencyFromServer();
    expect(store.get("bm_last_active_date")).toBe("2025-06-10");
  });

  it("does NOT overwrite a more recent local lastActive with an older server date", async () => {
    const store = setupLocalStorage({ bm_last_active_date: "2025-06-15" });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, streak: 4, lastCheckinDate: "2025-06-01" }),
    });
    await syncUrgencyFromServer();
    // Local date (Jun 15) is ahead — don't overwrite with older server date (Jun 1)
    expect(store.get("bm_last_active_date")).toBe("2025-06-15");
  });

  it("is non-fatal when the fetch fails", async () => {
    setupLocalStorage({});
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    await expect(syncUrgencyFromServer()).resolves.toBeUndefined();
  });

  it("is non-fatal when the server returns a non-ok response", async () => {
    setupLocalStorage({});
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
    await expect(syncUrgencyFromServer()).resolves.toBeUndefined();
  });

  it("does nothing in SSR context (no window)", async () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error — simulate SSR
    delete globalThis.window;
    await expect(syncUrgencyFromServer()).resolves.toBeUndefined();
    globalThis.window = originalWindow;
  });
});
