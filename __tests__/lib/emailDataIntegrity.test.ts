import { describe, expect, it } from "vitest";
import { daysSinceLastActivity, daysSinceMomentumUpdate } from "@/lib/inactivity";
import { escapeHtml } from "@/lib/htmlEscape";
import { buildHTML as buildEmail } from "@/lib/email";

const now = new Date("2026-10-11T10:00:00Z");

describe("daysSinceLastActivity", () => {
  it("uses the most recent of the three activity dates", () => {
    expect(daysSinceLastActivity({ last_active: "2026-10-01", last_checkin_date: "2026-10-09", last_task_date: "2026-10-05" }, now)).toBe(2);
  });
  it("is 0 when active today, even with no reflection", () => {
    expect(daysSinceLastActivity({ last_active: "2026-10-10", last_task_date: "2026-10-11" }, now)).toBe(0);
  });
  it("returns null with no usable dates", () => {
    expect(daysSinceLastActivity({}, now)).toBeNull();
    expect(daysSinceLastActivity(null, now)).toBeNull();
    expect(daysSinceLastActivity({ last_active: "garbage" }, now)).toBeNull();
  });
});

describe("daysSinceMomentumUpdate", () => {
  it("is the gap since the last write, minimum 1 - not the cumulative inactive days", () => {
    expect(daysSinceMomentumUpdate("2026-10-10T18:00:00Z", now)).toBe(1);
    expect(daysSinceMomentumUpdate("2026-10-08T10:00:00Z", now)).toBe(3);
    expect(daysSinceMomentumUpdate(undefined, now)).toBe(1);
    expect(daysSinceMomentumUpdate("nope", now)).toBe(1);
  });
});

describe("escapeHtml", () => {
  it("neutralises markup", () => {
    expect(escapeHtml(`<img src=x onerror="a()">&'`)).toBe("&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;");
  });
});

describe("weekly_behavioral_review email", () => {
  const base = { name: "Kwame", startupName: "Acme", tasksCompleted: 3, momentumEnd: 62, streak: 2 };
  it("states the real change against last week's baseline", () => {
    const e = buildEmail("weekly_behavioral_review", { ...base, momentumStart: 55 });
    expect(e.subject).toContain("momentum ↑7");
    expect(e.html).toContain("7 pts vs last week");
  });
  it("never claims a change when there is no baseline", () => {
    const e = buildEmail("weekly_behavioral_review", { ...base, momentumStart: null });
    expect(e.subject).toContain("momentum 62");
    expect(e.subject).not.toMatch(/[↑↓]/);
    expect(e.html).not.toContain("vs last week");
  });
  it("says steady, not ↑0, when nothing moved", () => {
    const e = buildEmail("weekly_behavioral_review", { ...base, momentumStart: 62 });
    expect(e.subject).toContain("steady at 62");
  });
  it("escapes AI/user text", () => {
    const e = buildEmail("weekly_behavioral_review", { ...base, momentumStart: 60, name: "<b>x</b>", avoidancePattern: "<script>1</script>" });
    expect(e.html).not.toContain("<script>");
    expect(e.html).not.toContain("<b>x</b>");
  });
});
