import { describe, it, expect, vi, beforeEach } from "vitest";

const mem = new Map<string, unknown>();
vi.mock("@/lib/storage", () => ({
  storage: {
    getJSON: (k: string, d: unknown) => (mem.has(k) ? mem.get(k) : d),
    setJSON: (k: string, v: unknown) => { mem.set(k, v); },
    get: (k: string) => (mem.has(k) ? String(mem.get(k)) : null),
    set: (k: string, v: unknown) => { mem.set(k, v); },
    remove: (k: string) => { mem.delete(k); },
  },
}));
vi.mock("@/lib/plan", () => ({ getStoredStreak: () => 0 }));
vi.mock("@/lib/userBehaviorState", () => ({ fetchBehaviorState: async () => ({}), persistBehaviorState: () => {} }));

import { addNotification, getAllNotifications } from "@/lib/notifications";

const base = { emoji: "x", priority: "high" as const };

describe("addNotification dedupe", () => {
  beforeEach(() => {
    mem.clear();
    (globalThis as any).window = { dispatchEvent: () => true };
  });

  it("no longer lets different notifications of the same type swallow each other", () => {
    addNotification({ ...base, type: "reflect_pending", dedupeKey: "morning_briefing:d", title: "Morning", body: "a" });
    addNotification({ ...base, type: "reflect_pending", dedupeKey: "evening_checkin:d", title: "Evening", body: "b" });
    expect(getAllNotifications().map((n) => n.title).sort()).toEqual(["Evening", "Morning"]);
  });

  it("updates a keyed notification in place when its numbers change", () => {
    addNotification({ ...base, type: "weekly_pace", dedupeKey: "weekly_pace:w1", title: "1 of 3 days active", body: "x" });
    addNotification({ ...base, type: "weekly_pace", dedupeKey: "weekly_pace:w1", title: "2 of 3 days active", body: "x" });
    const all = getAllNotifications();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("2 of 3 days active");
  });

  it("keeps legacy 24h type-based dedupe for un-keyed callers", () => {
    addNotification({ ...base, type: "streak_broken", title: "Broken", body: "a" });
    addNotification({ ...base, type: "streak_broken", title: "Broken again", body: "b" });
    expect(getAllNotifications()).toHaveLength(1);
  });
});
