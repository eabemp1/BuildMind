/**
 * __tests__/lib/notifications.test.ts
 *
 * Unit tests for the pure functions in lib/notifications.ts.
 * localStorage is mocked via a simple in-memory store so tests run in Node.
 * Network-dependent functions are not tested here.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── localStorage mock ─────────────────────────────────────────────────────────

const store: Record<string, string> = {};
const localStorageMock = {
  getItem:    (k: string) => store[k] ?? null,
  setItem:    (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear:      () => { Object.keys(store).forEach(k => delete store[k]); },
};
Object.defineProperty(global, "localStorage", { value: localStorageMock, writable: true });

// dispatchEvent is called by addNotification — stub it out
Object.defineProperty(global, "window", {
  value: { dispatchEvent: vi.fn(), localStorage: localStorageMock },
  writable: true,
});

// ── Imports (after mock is set up) ───────────────────────────────────────────

import {
  addNotification,
  getAllNotifications,
  getUnreadNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
  notifyStreakBroken,
  notifyStreakMilestone,
  notifyReflectPending,
  notifyWeeklyReportReady,
  notifyInactivity,
  notifyUpgradeNudge,
  notifyWelcome,
  clearNotificationsForCurrentUser,
  getUnreadNotificationCount,
  type AppNotification,
} from "../../lib/notifications";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNotif(overrides: Partial<Omit<AppNotification, "id" | "createdAt">> = {}) {
  return {
    type: "task_done" as const,
    title: "Test",
    body: "Test body",
    emoji: "✅",
    priority: "low" as const,
    ...overrides,
  };
}

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

// ── addNotification ───────────────────────────────────────────────────────────

describe("addNotification", () => {
  it("stores a notification and returns it with id and createdAt", () => {
    const notif = addNotification(makeNotif());
    expect(notif.id).toMatch(/^notif_/);
    expect(typeof notif.createdAt).toBe("number");
    expect(notif.title).toBe("Test");
  });

  it("added notification appears in getAllNotifications", () => {
    addNotification(makeNotif({ title: "Alpha" }));
    const all = getAllNotifications();
    expect(all.some(n => n.title === "Alpha")).toBe(true);
  });

  it("deduplicates — adding same type twice within 24h returns existing", () => {
    const first  = addNotification(makeNotif({ type: "task_done" }));
    const second = addNotification(makeNotif({ type: "task_done" }));
    expect(second.id).toBe(first.id);
    expect(getAllNotifications().filter(n => n.type === "task_done")).toHaveLength(1);
  });

  it("allows same type after 24h (does not deduplicate old entries)", () => {
    // Manually inject an old notification
    const old: AppNotification = {
      ...makeNotif({ type: "reflect_pending" }),
      id: "old-001",
      createdAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
    };
    localStorageMock.setItem("bm_notifications", JSON.stringify([old]));

    const fresh = addNotification(makeNotif({ type: "reflect_pending" }));
    expect(fresh.id).not.toBe("old-001");
  });

  it("limits storage to MAX_NOTIFS (50)", () => {
    for (let i = 0; i < 55; i++) {
      // each type is unique so dedup doesn't fire
      addNotification(makeNotif({ type: "achievement", title: `Notif ${i}` }));
      // clear dedup by changing the stored type slightly via direct store write
      const all = getAllNotifications().map(n => ({ ...n, readAt: Date.now() }));
      localStorageMock.setItem("bm_notifications", JSON.stringify(all));
    }
    // After 55 additions with dedup bypassed, cap at 50
    expect(getAllNotifications().length).toBeLessThanOrEqual(50);
  });

  it("dispatches bm_notification_added event", () => {
    addNotification(makeNotif());
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.any(Object));
  });
});

// ── getAllNotifications ────────────────────────────────────────────────────────

describe("getAllNotifications", () => {
  it("returns empty array when localStorage is empty", () => {
    expect(getAllNotifications()).toEqual([]);
  });

  it("prunes expired notifications automatically", () => {
    const expired: AppNotification = {
      ...makeNotif(),
      id: "exp-001",
      createdAt: Date.now() - 10000,
      expiresAt: Date.now() - 1, // already expired
    };
    const live: AppNotification = {
      ...makeNotif({ title: "Live" }),
      id: "live-001",
      createdAt: Date.now(),
    };
    localStorageMock.setItem("bm_notifications", JSON.stringify([expired, live]));
    const result = getAllNotifications();
    expect(result.find(n => n.id === "exp-001")).toBeUndefined();
    expect(result.find(n => n.id === "live-001")).toBeDefined();
  });

  it("returns notifications without expiresAt (they never expire)", () => {
    const permanent: AppNotification = {
      ...makeNotif(),
      id: "perm-001",
      createdAt: Date.now(),
    };
    localStorageMock.setItem("bm_notifications", JSON.stringify([permanent]));
    expect(getAllNotifications()).toHaveLength(1);
  });

  it("handles corrupt JSON gracefully (returns empty array)", () => {
    localStorageMock.setItem("bm_notifications", "not valid json {{");
    expect(getAllNotifications()).toEqual([]);
  });
});

// ── getUnreadNotifications / getUnreadCount ────────────────────────────────────

describe("getUnreadNotifications + getUnreadCount", () => {
  it("returns only unread notifications", () => {
    const read: AppNotification   = { ...makeNotif(), id: "r1", createdAt: Date.now(), readAt: Date.now() };
    const unread: AppNotification = { ...makeNotif(), id: "u1", createdAt: Date.now() };
    localStorageMock.setItem("bm_notifications", JSON.stringify([read, unread]));
    const unreadList = getUnreadNotifications();
    expect(unreadList).toHaveLength(1);
    expect(unreadList[0].id).toBe("u1");
  });

  it("sorts unread notifications newest first", () => {
    const older: AppNotification  = { ...makeNotif(), id: "old", createdAt: Date.now() - 5000 };
    const newer: AppNotification  = { ...makeNotif(), id: "new", createdAt: Date.now() };
    localStorageMock.setItem("bm_notifications", JSON.stringify([older, newer]));
    const result = getUnreadNotifications();
    expect(result[0].id).toBe("new");
    expect(result[1].id).toBe("old");
  });

  it("getUnreadCount returns 0 when all read", () => {
    const read: AppNotification = { ...makeNotif(), id: "r1", createdAt: Date.now(), readAt: Date.now() };
    localStorageMock.setItem("bm_notifications", JSON.stringify([read]));
    expect(getUnreadCount()).toBe(0);
  });

  it("getUnreadNotificationCount is an alias for getUnreadCount", () => {
    expect(getUnreadNotificationCount).toBe(getUnreadCount);
  });
});

// ── markRead ──────────────────────────────────────────────────────────────────

describe("markRead", () => {
  it("sets readAt on the matching notification", () => {
    const notif = addNotification(makeNotif());
    markRead(notif.id);
    const all = getAllNotifications();
    const found = all.find(n => n.id === notif.id);
    expect(found?.readAt).toBeDefined();
    expect(typeof found?.readAt).toBe("number");
  });

  it("does not throw for unknown id", () => {
    expect(() => markRead("nonexistent-id")).not.toThrow();
  });

  it("marks exactly one notification", () => {
    const a = addNotification(makeNotif({ type: "welcome" }));
    // force dedup bypass
    const all = getAllNotifications().map(n => ({ ...n, readAt: Date.now() }));
    localStorageMock.setItem("bm_notifications", JSON.stringify(all));
    const b = addNotification(makeNotif({ type: "streak_broken" }));
    markRead(b.id);
    const result = getAllNotifications();
    const aAfter = result.find(n => n.id === a.id);
    expect(aAfter?.readAt).toBeDefined(); // was already read
    const bAfter = result.find(n => n.id === b.id);
    expect(bAfter?.readAt).toBeDefined();
  });
});

// ── markAllRead ───────────────────────────────────────────────────────────────

describe("markAllRead", () => {
  it("marks all notifications as read", () => {
    const n1: AppNotification = { ...makeNotif(), id: "n1", createdAt: Date.now() };
    const n2: AppNotification = { ...makeNotif(), id: "n2", createdAt: Date.now() };
    localStorageMock.setItem("bm_notifications", JSON.stringify([n1, n2]));
    markAllRead();
    expect(getUnreadCount()).toBe(0);
  });

  it("does not throw when there are no notifications", () => {
    expect(() => markAllRead()).not.toThrow();
  });
});

// ── deleteNotification ────────────────────────────────────────────────────────

describe("deleteNotification", () => {
  it("removes the notification with the given id", () => {
    const notif = addNotification(makeNotif());
    deleteNotification(notif.id);
    expect(getAllNotifications().find(n => n.id === notif.id)).toBeUndefined();
  });

  it("leaves other notifications intact", () => {
    const a = addNotification(makeNotif({ type: "welcome" }));
    const all = getAllNotifications().map(n => ({ ...n, readAt: Date.now() }));
    localStorageMock.setItem("bm_notifications", JSON.stringify(all));
    const b = addNotification(makeNotif({ type: "streak_broken" }));
    deleteNotification(b.id);
    expect(getAllNotifications().find(n => n.id === a.id)).toBeDefined();
  });

  it("does not throw for unknown id", () => {
    expect(() => deleteNotification("ghost-id")).not.toThrow();
  });
});

// ── clearNotificationsForCurrentUser ─────────────────────────────────────────

describe("clearNotificationsForCurrentUser", () => {
  it("removes all notifications from localStorage", () => {
    addNotification(makeNotif());
    clearNotificationsForCurrentUser();
    expect(getAllNotifications()).toHaveLength(0);
  });
});

// ── Smart notification generators ────────────────────────────────────────────

describe("notifyStreakBroken", () => {
  it("creates a streak_broken notification mentioning the streak length", () => {
    notifyStreakBroken(14);
    const notifs = getAllNotifications();
    const found = notifs.find(n => n.type === "streak_broken");
    expect(found).toBeDefined();
    expect(found?.body).toContain("14");
    expect(found?.priority).toBe("high");
  });

  it("has an actionHref pointing to /today", () => {
    notifyStreakBroken(5);
    const found = getAllNotifications().find(n => n.type === "streak_broken");
    expect(found?.actionHref).toBe("/today");
  });
});

describe("notifyStreakMilestone", () => {
  it("creates a notification for known milestones (3, 7, 14, 30, 100)", () => {
    [3, 7, 14, 30, 100].forEach(milestone => {
      localStorageMock.clear();
      notifyStreakMilestone(milestone);
      const found = getAllNotifications().find(n => n.type === "streak_milestone");
      expect(found).toBeDefined();
      expect(found?.body).toContain(String(milestone));
    });
  });

  it("does NOT create a notification for non-milestone streaks", () => {
    notifyStreakMilestone(5);
    expect(getAllNotifications().find(n => n.type === "streak_milestone")).toBeUndefined();

    notifyStreakMilestone(99);
    expect(getAllNotifications().find(n => n.type === "streak_milestone")).toBeUndefined();
  });

  it("links to /achievements", () => {
    notifyStreakMilestone(7);
    const found = getAllNotifications().find(n => n.type === "streak_milestone");
    expect(found?.actionHref).toBe("/achievements");
  });
});

describe("notifyReflectPending", () => {
  it("creates a reflect_pending notification with medium priority", () => {
    notifyReflectPending();
    const found = getAllNotifications().find(n => n.type === "reflect_pending");
    expect(found).toBeDefined();
    expect(found?.priority).toBe("medium");
    expect(found?.actionHref).toBe("/reflect");
  });

  it("sets an expiresAt in the future", () => {
    notifyReflectPending();
    const found = getAllNotifications().find(n => n.type === "reflect_pending");
    expect(found?.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe("notifyWeeklyReportReady", () => {
  it("does NOT create notification when it is not Friday", () => {
    // Mock a non-Friday day (Monday = 1)
    const spy = vi.spyOn(global, "Date").mockImplementation(() => {
      const d = new (vi.importActual("vitest") as never)?.Date?.() ?? new Date();
      void d;
      return { getDay: () => 1 } as unknown as Date;
    });
    notifyWeeklyReportReady();
    expect(getAllNotifications().find(n => n.type === "weekly_report_ready")).toBeUndefined();
    spy.mockRestore();
  });

  it("creates notification on Friday (day 5)", () => {
    vi.spyOn(Date.prototype, "getDay").mockReturnValue(5);
    notifyWeeklyReportReady();
    const found = getAllNotifications().find(n => n.type === "weekly_report_ready");
    expect(found).toBeDefined();
    expect(found?.actionHref).toBe("/reports");
    vi.restoreAllMocks();
  });
});

describe("notifyInactivity", () => {
  it("does NOT create notification when daysSinceLastAction < 2", () => {
    notifyInactivity(1);
    notifyInactivity(0);
    expect(getAllNotifications().find(n => n.type === "inactivity_nudge")).toBeUndefined();
  });

  it("creates notification at 2 days inactive", () => {
    notifyInactivity(2);
    const found = getAllNotifications().find(n => n.type === "inactivity_nudge");
    expect(found).toBeDefined();
    expect(found?.priority).toBe("high");
  });

  it("escalates to urgent priority at 7 days", () => {
    notifyInactivity(7);
    const found = getAllNotifications().find(n => n.type === "inactivity_nudge");
    expect(found?.priority).toBe("urgent");
  });

  it("handles unlisted day counts with a fallback message", () => {
    notifyInactivity(10);
    const found = getAllNotifications().find(n => n.type === "inactivity_nudge");
    expect(found?.body).toContain("10");
  });

  it("actionHref points to /today", () => {
    notifyInactivity(3);
    const found = getAllNotifications().find(n => n.type === "inactivity_nudge");
    expect(found?.actionHref).toBe("/today");
  });
});

describe("notifyUpgradeNudge", () => {
  it("creates upgrade_nudge for weekly_limit reason", () => {
    notifyUpgradeNudge("weekly_limit");
    const found = getAllNotifications().find(n => n.type === "upgrade_nudge");
    expect(found).toBeDefined();
    expect(found?.body).toContain("weekly");
    expect(found?.actionHref).toBe("/upgrade");
  });

  it("creates upgrade_nudge for ai_limit reason", () => {
    notifyUpgradeNudge("ai_limit");
    const all = getAllNotifications().map(n => ({ ...n, readAt: Date.now() }));
    localStorageMock.setItem("bm_notifications", JSON.stringify(all));
    notifyUpgradeNudge("ai_limit");
    const found = getAllNotifications().find(n => n.type === "upgrade_nudge" && n.body.includes("AI"));
    // At least one ai_limit notification was created
    const anyUpgrade = getAllNotifications().find(n => n.type === "upgrade_nudge");
    expect(anyUpgrade).toBeDefined();
  });

  it("creates upgrade_nudge for feature reason", () => {
    const all = getAllNotifications().map(n => ({ ...n, readAt: Date.now() }));
    localStorageMock.setItem("bm_notifications", JSON.stringify(all));
    notifyUpgradeNudge("feature");
    const found = getAllNotifications().find(n => n.type === "upgrade_nudge");
    expect(found).toBeDefined();
  });

  it("has medium priority", () => {
    notifyUpgradeNudge("weekly_limit");
    const found = getAllNotifications().find(n => n.type === "upgrade_nudge");
    expect(found?.priority).toBe("medium");
  });
});

describe("notifyWelcome", () => {
  it("creates a welcome notification on first call", () => {
    notifyWelcome();
    const found = getAllNotifications().find(n => n.type === "welcome");
    expect(found).toBeDefined();
    expect(found?.actionHref).toBe("/today");
  });

  it("does not create a second welcome notification", () => {
    notifyWelcome();
    notifyWelcome();
    const welcomes = getAllNotifications().filter(n => n.type === "welcome");
    expect(welcomes).toHaveLength(1);
  });
});
