import { describe, it, expect } from "vitest";
import { parseNotificationPrefs, DEFAULT_NOTIFICATION_PREFS } from "../../lib/notificationPrefs";
import { filterByNotificationPref, loadNotificationPrefs } from "../../lib/server/notificationPrefs";

function fakeClient(rows: Array<{ user_id: string; value: unknown }>, fail = false) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: async (_c: string, ids: string[]) =>
            fail ? { data: null, error: { message: "down" } } : { data: rows.filter((r) => ids.includes(r.user_id)), error: null },
        }),
      }),
    }),
  };
}

describe("parseNotificationPrefs", () => {
  it("returns the defaults for nothing", () => {
    expect(parseNotificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(parseNotificationPrefs("junk")).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });
  it("keeps valid booleans and ignores wrong types", () => {
    expect(parseNotificationPrefs({ streakReminder: false, weeklyReport: "no", coachTips: true })).toEqual({
      streakReminder: false, weeklyReport: true, coachTips: true,
    });
  });
});

describe("filterByNotificationPref", () => {
  const rows = [
    { user_id: "a", value: { streakReminder: false, weeklyReport: true, coachTips: false } },
    { user_id: "b", value: { streakReminder: true, weeklyReport: false, coachTips: false } },
  ];
  it("removes users who switched the reminder off, keeps users with no saved choice", async () => {
    expect(await filterByNotificationPref(fakeClient(rows), ["a", "b", "c"], "streakReminder")).toEqual(["b", "c"]);
  });
  it("handles the weekly report switch separately", async () => {
    expect(await filterByNotificationPref(fakeClient(rows), ["a", "b", "c"], "weeklyReport")).toEqual(["a", "c"]);
  });
  it("falls back to defaults (sends) when the lookup fails", async () => {
    expect(await filterByNotificationPref(fakeClient(rows, true), ["a", "b"], "streakReminder")).toEqual(["a", "b"]);
    expect((await loadNotificationPrefs(fakeClient(rows, true), ["a"])).size).toBe(0);
  });
});
