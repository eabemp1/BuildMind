import { describe, it, expect } from "vitest";
import { localDay, founderLocalNow, bucketWeeks } from "@/lib/ghostRaceData";

describe("ghost race counts by the founder's local day", () => {
  it("an evening completion east of UTC lands on that local day", () => {
    // 23:30 UTC Monday is already Tuesday at UTC+2
    expect(localDay("2026-10-19T23:30:00.000Z", 2)).toBe("2026-10-20");
    expect(localDay("2026-10-19T23:30:00.000Z", 0)).toBe("2026-10-19");
  });
  it("an evening completion west of UTC stays on the local day", () => {
    // 02:00 UTC Tuesday is still Monday evening in New York (UTC-4)
    expect(localDay("2026-10-20T02:00:00.000Z", -4)).toBe("2026-10-19");
  });
  it("founderLocalNow reads as the local clock", () => {
    expect(founderLocalNow(-5, new Date("2026-10-20T02:00:00.000Z")).getUTCDate()).toBe(19);
  });
  it("two evening completions count in the current week", () => {
    const days = [localDay("2026-10-18T22:30:00.000Z", 3), localDay("2026-10-18T22:45:00.000Z", 3)]; // Mon 01:30 local
    const { current } = bucketWeeks([], days, "2026-10-19");
    expect(current.total).toBe(2);
  });
  it("invalid timestamps are ignored", () => {
    expect(localDay("nope", 0)).toBe("");
  });
});
