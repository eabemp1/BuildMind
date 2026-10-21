import { describe, it, expect } from "vitest";
import { resolveDayKey } from "@/lib/dayKey";

describe("done-date uses the founder's local day", () => {
  it("accepts the client's local day when it is within a day of UTC", () => {
    // 01:30 UTC on the 21st is still the evening of the 20th at UTC-4
    const now = new Date("2026-10-21T01:30:00.000Z");
    expect(resolveDayKey("2026-10-20", now)).toBe("2026-10-20");
  });
  it("rejects an arbitrary or malformed day", () => {
    const now = new Date("2026-10-21T01:30:00.000Z");
    expect(resolveDayKey("2026-01-01", now)).toBe("2026-10-21");
    expect(resolveDayKey("garbage", now)).toBe("2026-10-21");
    expect(resolveDayKey(undefined, now)).toBe("2026-10-21");
  });
});
