import { describe, it, expect, vi } from "vitest";

type Rows = Record<string, unknown[]>;
let rows: Rows = {};
let single: Record<string, unknown> = {};

function chain(table: string) {
  const q: any = {
    select: () => q, eq: () => q, neq: () => q, not: () => q, gte: () => q, order: () => q, limit: () => q,
    maybeSingle: async () => ({ data: single[table] ?? null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], count: (rows[table] ?? []).length }).then(res),
  };
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => chain(t) }) }));

import { buildInsightNotifications } from "@/lib/server/notificationInsights";

const NOW = new Date("2026-10-01T16:00:00.000Z"); // Thursday

describe("buildInsightNotifications", () => {
  it("returns nothing for a brand-new founder (no filler)", async () => {
    rows = {}; single = {};
    expect(await buildInsightNotifications("u1", undefined, NOW)).toEqual([]);
  });

  it("names today's pending task and counts only Today-flow rows", async () => {
    rows = {
      reflexion_learning_log: [
        { outcome: "pending", action_shown: "Interview 3 customers about onboarding", created_at: "2026-10-01T08:00:00Z", outcome_recorded_at: null, session_id: "today_action:p:1" },
        { outcome: "completed", action_shown: "Bms run", created_at: "2026-10-01T09:00:00Z", outcome_recorded_at: "2026-10-01T09:00:00Z", session_id: "bms_123" },
      ],
    };
    single = {};
    const items = await buildInsightNotifications("u1", undefined, NOW);
    const today = items.find((i) => i.type === "today_action");
    expect(today?.body).toContain("Interview 3 customers");
    expect(items.find((i) => i.type === "reflect_pending")).toBeUndefined();
  });

  it("credits a completion to the day it was finished and asks to reflect", async () => {
    rows = {
      reflexion_learning_log: [
        { outcome: "completed", action_shown: "Ship pricing page", created_at: "2026-09-29T08:00:00Z", outcome_recorded_at: "2026-10-01T10:00:00Z", session_id: "today_action:p:1" },
      ],
    };
    const items = await buildInsightNotifications("u1", undefined, NOW);
    expect(items.find((i) => i.type === "reflect_pending")?.body).toContain("Ship pricing page");
    expect(items.find((i) => i.type === "weekly_pace")?.title).toMatch(/1 of 4 days active/);
  });

  it("warns about streak risk only when nothing completed today", async () => {
    rows = {}; single = { founder_context: { streak: 5, last_checkin_date: "2026-09-30", momentum_score: 40, momentum_last_week: 60 } };
    const items = await buildInsightNotifications("u1", undefined, NOW);
    expect(items.find((i) => i.type === "streak_risk")?.title).toContain("5-day streak");
    expect(items.find((i) => i.type === "momentum_shift")?.title).toContain("down 20");
  });

  it("every item carries a stable dedupeKey and an expiry", async () => {
    rows = {}; single = { founder_context: { streak: 3, last_checkin_date: "2026-09-30", avoidance_zones: ["Cold outreach"] } };
    const items = await buildInsightNotifications("u1", undefined, NOW);
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) { expect(i.dedupeKey).toBeTruthy(); expect(i.expiresInMs).toBeGreaterThan(0); }
  });
});
