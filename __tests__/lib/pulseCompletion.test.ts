import { describe, it, expect } from "vitest";
import { computeMilestonePacing } from "@/lib/milestonePacing";

describe("milestone pacing with real counts", () => {
  it("is graded once a deadline and a finished task exist", () => {
    const r = computeMilestonePacing(
      { id: "m", title: "Beta", targetDate: "2026-11-30", createdAt: "2026-10-01T00:00:00Z", status: "active", tasksTotal: 4, tasksCompleted: 2 },
      new Date("2026-10-09T00:00:00Z"),
    );
    expect(r.risk).not.toBe("unknown");
  });
});
