import { describe, it, expect } from "vitest";
import { inSendWindow, localHour, parseOffsetMinutes } from "@/lib/pushWindow";

const at7 = new Date("2026-10-22T07:00:00Z");
const at16 = new Date("2026-10-22T16:00:00Z");

describe("localHour", () => {
  it("applies the offset and wraps the day", () => {
    expect(localHour(at7, 0)).toBe(7);
    expect(localHour(at7, -240)).toBe(3);      // New York (EDT)
    expect(localHour(at7, 330)).toBe(12);      // India
    expect(localHour(new Date("2026-10-22T02:00:00Z"), -480)).toBe(18); // previous evening
  });
});

describe("inSendWindow", () => {
  it("skips the middle of the night and allows the morning", () => {
    expect(inSendWindow(at7, -240)).toBe(false);
    expect(inSendWindow(at16, -240)).toBe(true);
    expect(inSendWindow(at7, 0)).toBe(true);   // Ghana
    expect(inSendWindow(at16, 600)).toBe(false); // Sydney, 02:00
    expect(inSendWindow(at7, 600)).toBe(true);
  });
  it("every real offset is reachable at 07:00 or 16:00 UTC", () => {
    for (let off = -12 * 60; off <= 14 * 60; off += 30) {
      expect(inSendWindow(at7, off) || inSendWindow(at16, off)).toBe(true);
    }
  });
  it("unknown or nonsense offsets count as in-window", () => {
    expect(inSendWindow(at7, null)).toBe(true);
    expect(inSendWindow(at7, "abc")).toBe(true);
    expect(inSendWindow(at7, 99999)).toBe(true);
    expect(parseOffsetMinutes("-240")).toBe(-240);
  });
});
