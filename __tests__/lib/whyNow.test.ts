import { describe, it, expect } from "vitest";
import { pickWhyNow } from "@/lib/today/whyNow";
import { whenChoices, timeLabel } from "@/lib/today/whenToday";

const none = { waiting: 0, sentRecent: 0, repliedRecent: 0, marketChanges: 0 };

describe("pickWhyNow", () => {
  it("says nothing without a real reason", () => { expect(pickWhyNow(none)).toBeNull(); });
  it("puts people waiting first", () => {
    expect(pickWhyNow({ ...none, waiting: 2, repliedRecent: 1, sentRecent: 3, marketChanges: 4 })).toBe("2 people are waiting on your follow-up.");
    expect(pickWhyNow({ ...none, waiting: 1 })).toBe("1 person is waiting on your follow-up.");
  });
  it("shows replies only when someone replied", () => {
    expect(pickWhyNow({ ...none, sentRecent: 3 })).toBeNull();
    expect(pickWhyNow({ ...none, sentRecent: 3, repliedRecent: 1 })).toBe("You messaged 3 people recently. 1 replied.");
  });
  it("falls back to market changes", () => {
    expect(pickWhyNow({ ...none, marketChanges: 1 })).toBe("Market Watch found 1 change among your competitors this week.");
  });
});

describe("whenChoices", () => {
  it("offers an hour from now and the next fixed times", () => {
    const c = whenChoices(new Date(2026, 10, 6, 9, 0));
    expect(c.map((x) => x.label)).toEqual(["In 1 hour", "12:00 PM", "3:00 PM"]);
    expect(c[0]).toMatchObject({ h: 10, m: 0, tomorrow: false });
  });
  it("skips times too close to now", () => {
    expect(whenChoices(new Date(2026, 10, 6, 11, 0)).map((x) => x.label)).toEqual(["In 1 hour", "3:00 PM", "6:00 PM"]);
  });
  it("offers tomorrow morning late at night and flags a midnight crossing", () => {
    const c = whenChoices(new Date(2026, 10, 6, 23, 30));
    expect(c[0].tomorrow).toBe(true);
    expect(c[1]).toMatchObject({ label: "Tomorrow 9:00 AM", h: 9, tomorrow: true });
  });
  it("formats times", () => { expect(timeLabel(0, 5)).toBe("12:05 AM"); expect(timeLabel(15, 0)).toBe("3:00 PM"); });
});

describe("milestone reason", () => {
  const none2 = { waiting: 0, sentRecent: 0, repliedRecent: 0, marketChanges: 0 };
  it("names a milestone due within 3 days or overdue", () => {
    expect(pickWhyNow({ ...none2, milestone: { title: "Launch beta", days: 2 } })).toBe('Your milestone "Launch beta" is due in 2 days.');
    expect(pickWhyNow({ ...none2, milestone: { title: "Launch beta", days: 0 } })).toBe('Your milestone "Launch beta" is due today.');
    expect(pickWhyNow({ ...none2, milestone: { title: "Pricing", days: -2 } })).toBe('Your milestone "Pricing" was due 2 days ago.');
  });
  it("ignores a distant or very old one, and people waiting still win", () => {
    expect(pickWhyNow({ ...none2, milestone: { title: "x", days: 9 } })).toBeNull();
    expect(pickWhyNow({ ...none2, milestone: { title: "x", days: -30 } })).toBeNull();
    expect(pickWhyNow({ ...none2, waiting: 1, milestone: { title: "x", days: 1 } })).toBe("1 person is waiting on your follow-up.");
  });
});
