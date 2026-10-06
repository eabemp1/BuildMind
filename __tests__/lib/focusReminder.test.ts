import { describe, it, expect } from "vitest";
import { detectPlatform, androidTimerIntentUrl, buildFocusIcs } from "@/lib/focusReminder";

describe("detectPlatform", () => {
  it("recognises Android, iPhone and iPadOS", () => {
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", 5)).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome", 0)).toBe("other");
  });
});

describe("android timer intent", () => {
  it("sets the length in seconds and a label with no separators", () => {
    const url = androidTimerIntentUrl({ seconds: 1500, label: "Message 3 founders; on LinkedIn" });
    expect(url).toMatch(/^intent:#Intent;action=android\.intent\.action\.SET_TIMER;/);
    expect(url).toContain("i.android.intent.extra.alarm.LENGTH=1500");
    expect(decodeURIComponent(url.split("MESSAGE=")[1].split(";")[0])).toBe("Focus: Message 3 founders on LinkedIn");
    expect(url.endsWith(";end")).toBe(true);
  });
  it("never sets a zero or negative timer", () => {
    expect(androidTimerIntentUrl({ seconds: 0, label: "x" })).toContain("LENGTH=1;");
  });
});

describe("calendar file", () => {
  const start = new Date("2026-10-06T09:00:00.000Z");
  const end = new Date("2026-10-06T09:25:00.000Z");
  const ics = buildFocusIcs({ task: "Interview 3 founders, ask about last week", start, end, firstStep: "Open LinkedIn" });
  it("is a valid event with an alert at the end of the block", () => {
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20261006T090000Z");
    expect(ics).toContain("DTEND:20261006T092500Z");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER;RELATED=END:PT0S");
    expect(ics).toContain("END:VCALENDAR");
  });
  it("escapes commas and keeps lines under 75 characters", () => {
    expect(ics).toContain("Interview 3 founders\\, ask about last week");
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
  });
  it("uses CRLF line endings", () => {
    expect(ics.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });
});
