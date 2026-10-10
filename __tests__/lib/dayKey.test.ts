import { describe, expect, it } from "vitest";
import { resolveDayKey, utcDayKey } from "@/lib/dayKey";

const now = new Date("2026-10-10T12:00:00Z");

describe("resolveDayKey", () => {
  it("falls back to the UTC day for missing or malformed input", () => {
    expect(resolveDayKey(undefined, now)).toBe("2026-10-10");
    expect(resolveDayKey("garbage", now)).toBe("2026-10-10");
    expect(resolveDayKey("2026-13-45", now)).toBe("2026-10-10");
  });
  it("accepts the client's local day within one day of UTC", () => {
    expect(resolveDayKey("2026-10-11", now)).toBe("2026-10-11");
    expect(resolveDayKey("2026-10-09", now)).toBe("2026-10-09");
  });
  it("rejects keys far from UTC today", () => {
    expect(resolveDayKey("2026-10-20", now)).toBe("2026-10-10");
    expect(resolveDayKey("1999-01-01", now)).toBe("2026-10-10");
  });
  it("utcDayKey formats", () => expect(utcDayKey(now)).toBe("2026-10-10"));
});
