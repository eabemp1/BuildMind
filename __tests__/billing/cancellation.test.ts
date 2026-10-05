import { describe, it, expect } from "vitest";
import { decideAccessAfterCancel, formatAccessDate, PAYMENT_GRACE_DAYS } from "@/lib/billing/cancellation";

const NOW = new Date("2026-10-03T12:00:00.000Z");

describe("decideAccessAfterCancel", () => {
  it("keeps access until the paid period ends", () => {
    const d = decideAccessAfterCancel("2026-11-02T00:00:00.000Z", NOW);
    expect(d).toEqual({ mode: "until_period_end", accessUntil: "2026-11-02T00:00:00.000Z" });
  });
  it("ends access now when the period already ended", () => {
    expect(decideAccessAfterCancel("2026-10-01T00:00:00.000Z", NOW)).toEqual({ mode: "immediate" });
  });
  it("ends access now when the end date is unknown or invalid", () => {
    expect(decideAccessAfterCancel(null, NOW)).toEqual({ mode: "immediate" });
    expect(decideAccessAfterCancel(undefined, NOW)).toEqual({ mode: "immediate" });
    expect(decideAccessAfterCancel("not-a-date", NOW)).toEqual({ mode: "immediate" });
  });
});

describe("formatAccessDate / grace", () => {
  it("formats like the emails", () => {
    expect(formatAccessDate("2026-11-12T10:00:00.000Z")).toBe("12 November 2026");
  });
  it("grace is a few days, not zero", () => {
    expect(PAYMENT_GRACE_DAYS).toBeGreaterThanOrEqual(1);
  });
});
