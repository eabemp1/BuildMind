import { describe, it, expect } from "vitest";
import { founderStatus } from "@/lib/admin/founderStatus";

describe("founderStatus", () => {
  it("is fine on day zero", () => expect(founderStatus({ daysSince: 0, finished: 0, activeDays: 1, lastSeenDays: 0 }).level).toBe("ok"));
  it("watches day 1 with nothing finished", () => expect(founderStatus({ daysSince: 1, finished: 0, activeDays: 1, lastSeenDays: 0 }).level).toBe("watch"));
  it("flags day 2 or later with nothing finished as risk", () => {
    const s = founderStatus({ daysSince: 2, finished: 0, activeDays: 1, lastSeenDays: 1 });
    expect(s.level).toBe("risk"); expect(s.text).toContain("Day 2");
  });
  it("is ok when a task is finished and they are recent", () => expect(founderStatus({ daysSince: 3, finished: 1, activeDays: 2, lastSeenDays: 1 }).level).toBe("ok"));
  it("watches a founder who finished one and went quiet", () => expect(founderStatus({ daysSince: 6, finished: 1, activeDays: 1, lastSeenDays: 5 }).level).toBe("watch"));
});
